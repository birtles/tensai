import { collate } from 'pouchdb-collate';
import { jsonEqualish } from '@birchill/json-equalish';

import * as actions from './actions';
import { Note } from '../model';
import { SaveState } from '../edit/reducer';
import { StoreError } from '../store/DataStore';
import { copyField } from '../utils/type-helpers';

export interface NoteState {
  formId: number;
  note: Partial<Note>;
  dirtyFields?: Set<keyof Note>;
  saveState: SaveState;
  saveError?: StoreError;
  // We need to make sure any notes we've edited stick around. Otherwise we can
  // end up with odd situations where, for example, as the user drops one
  // keyword from the note and an auto-save / sync happens, the note disappears
  // and they can no longer continuing to edit it.
  touched?: boolean;
  // The keywords at the point when the note was originally loaded. This is used
  // for sorting within a NoteList so that the order of notes doesn't change as
  // edits are made to the keywords in notes (although they will still shuffle
  // if the keywords on the card are changed).
  originalKeywords: Set<string>;
}

export function notes(
  state: Array<NoteState> = [],
  action: actions.NoteAction
): NoteState[] {
  switch (action.type) {
    case 'ADD_NOTE': {
      const newNote: Partial<Note> = {
        content: '',
        keywords: [],
      };
      if (action.initialKeywords) {
        newNote.keywords = action.initialKeywords.slice();
      }

      return [
        ...state,
        {
          formId: action.context.noteFormId,
          note: newNote,
          saveState: SaveState.New,
          touched: true,
          originalKeywords: new Set<string>(),
        },
      ];
    }

    case 'EDIT_NOTE': {
      // Find the note to update
      const noteStateIndex = findNoteIndex(state, action.context.noteFormId);
      if (noteStateIndex === -1) {
        return state;
      }
      const noteState = state[noteStateIndex];

      // Update the dirty fields
      const dirtyFields: Set<keyof Note> = noteState.dirtyFields
        ? new Set(noteState.dirtyFields.values())
        : new Set();
      let madeChange = false;
      for (const [field, value] of Object.entries(action.change) as Array<
        [keyof Note, any]
      >) {
        if (field !== 'id' && !jsonEqualish(value, noteState.note[field])) {
          dirtyFields.add(field);
          madeChange = true;
        }
      }

      if (!madeChange) {
        return state;
      }

      // Update the note
      const updatedNote: Partial<Note> = {
        ...noteState.note,
        ...action.change,
      };

      // Prepare the updated note state
      const updatedNoteState: NoteState = {
        ...noteState,
        note: updatedNote,
        dirtyFields,
        touched: true,
      };

      return updateState(state, updatedNoteState, noteStateIndex);
    }

    case 'SAVE_NOTE': {
      const noteStateIndex = findNoteIndex(state, action.context.noteFormId);
      if (noteStateIndex === -1) {
        return state;
      }
      const noteState = state[noteStateIndex];

      const updatedNoteState: NoteState = {
        ...noteState,
        saveState: SaveState.InProgress,
      };
      delete updatedNoteState.saveError;

      return updateState(state, updatedNoteState, noteStateIndex);
    }

    case 'FINISH_SAVE_NOTE': {
      const noteStateIndex = findNoteIndex(state, action.context.noteFormId);
      if (noteStateIndex === -1) {
        return state;
      }
      const noteState = state[noteStateIndex];

      const dirtyFields: Set<keyof Note> = new Set(
        (Object.keys(action.note) as Array<keyof Note>).filter(
          field =>
            field !== 'id' &&
            field !== 'created' &&
            field !== 'modified' &&
            !jsonEqualish(action.note[field], noteState.note[field])
        )
      );

      const updatedNoteState: NoteState = {
        formId: action.context.noteFormId,
        note: { ...action.note, ...noteState.note },
        saveState: SaveState.Ok,
        touched: true,
        originalKeywords: noteState.originalKeywords,
      };
      if (dirtyFields.size) {
        updatedNoteState.dirtyFields = dirtyFields;
      }

      return updateState(state, updatedNoteState, noteStateIndex);
    }

    case 'FAIL_SAVE_NOTE': {
      const noteStateIndex = findNoteIndex(state, action.context.noteFormId);
      if (noteStateIndex === -1) {
        return state;
      }
      const noteState = state[noteStateIndex];

      const updatedNoteState: NoteState = {
        ...noteState,
        saveState: SaveState.Error,
        saveError: action.error,
      };

      return updateState(state, updatedNoteState, noteStateIndex);
    }

    case 'DELETE_NOTE': {
      const noteStateIndex = findNoteIndex(state, action.context.noteFormId);
      if (noteStateIndex === -1) {
        return state;
      }

      const updatedState = state.slice();
      updatedState.splice(noteStateIndex, 1);
      return updatedState;
    }

    case 'UPDATE_NOTE_LIST': {
      // Check both lists use the same sorting so that we can iterate them in
      // tandem.
      if (process.env.NODE_ENV === 'development') {
        console.assert(
          action.notes.every(
            (value, index, notes) =>
              index === 0 || collate(notes[index - 1].id, value.id) === -1
          ),
          'Notes in action should be sorted by ID'
        );
        console.assert(
          state.every(
            (value, index, notes) =>
              index === 0 ||
              collate(notes[index - 1].note.id, value.note.id) === -1
          ),
          'Notes in state should be sorted by ID'
        );
        console.assert(
          action.noteFormIds.length >= action.notes.length,
          'There should be at least as many note form IDs as notes'
        );
      }

      const updatedState: Array<NoteState> = [];
      let madeChange: boolean = false;

      if (state.length !== action.notes.length) {
        madeChange = true;
      }

      let oldListIndex = 0;

      // Return the next NoteState that is _either_:
      //
      // - A match for |id|, OR
      // - A NoteState for a note that comes BEFORE |id| but we need to keep
      //   because it is still new / dirty / being saved.
      //
      // If no NoteStates match the above conditions, returns undefined.
      const getNextFromOldList = (id?: string): NoteState | undefined => {
        let foundSomething = false;
        while (oldListIndex < state.length) {
          const oldNoteState = state[oldListIndex];
          const collateResult = id
            ? collate(oldNoteState.note.id || '/ufff0', id)
            : 0;
          if (collateResult >= 0) {
            foundSomething = collateResult === 0;
            break;
          }

          if (
            typeof oldNoteState.note.id === 'string' &&
            action.deletedNoteIds.has(oldNoteState.note.id)
          ) {
            oldListIndex++;
            continue;
          }

          if (
            oldNoteState.touched ||
            oldNoteState.saveState !== SaveState.Ok ||
            (typeof oldNoteState.dirtyFields !== 'undefined' &&
              oldNoteState.dirtyFields.size !== 0)
          ) {
            foundSomething = true;
            break;
          }

          oldListIndex++;
        }
        return foundSomething ? state[oldListIndex++] : undefined;
      };

      for (
        let newListIndex = 0;
        newListIndex < action.notes.length;
        newListIndex++
      ) {
        const newNote = action.notes[newListIndex];
        let match: NoteState | undefined;
        let oldNoteState;
        while ((oldNoteState = getNextFromOldList(newNote.id))) {
          if (oldNoteState.note.id === newNote.id) {
            match = oldNoteState;
            break;
          }
          updatedState.push(oldNoteState);
        }

        if (match) {
          if (jsonEqualish(match.note, newNote)) {
            updatedState.push(match);
          } else {
            const noteState: NoteState = {
              formId: match.formId,
              note: newNote,
              saveState: match.saveState,
              originalKeywords: match.originalKeywords,
            };
            if (typeof match.dirtyFields !== 'undefined') {
              noteState.dirtyFields = match.dirtyFields;
              // Keep the dirty (unsaved) values rather than clobbering them
              // with whatever we got from the database.
              for (const field of match.dirtyFields) {
                copyField(noteState.note, match.note, field);
              }
            }
            if (typeof match.saveError !== 'undefined') {
              noteState.saveError = match.saveError;
            }
            if (typeof match.touched !== 'undefined' && match.touched) {
              noteState.touched = true;
            }
            updatedState.push(noteState);
            madeChange = true;
          }
        } else {
          const noteState: NoteState = {
            formId: action.noteFormIds.shift()!,
            note: newNote,
            saveState: SaveState.Ok,
            originalKeywords: new Set<string>(
              newNote.keywords.map(keyword => keyword.toLowerCase())
            ),
          };
          updatedState.push(noteState);
          madeChange = true;
        }
      }

      let oldNoteState;
      while ((oldNoteState = getNextFromOldList('\ufff0'))) {
        updatedState.push(oldNoteState);
      }

      return madeChange ? updatedState : state;
    }

    default:
      return state;
  }
}

function findNoteIndex(notes: Array<NoteState>, formId: number): number {
  return notes.findIndex((noteState: NoteState) => noteState.formId === formId);
}

function updateState(
  state: NoteState[],
  updatedNoteState: NoteState,
  noteStateIndex: number
): NoteState[] {
  const updatedState = state.slice();
  updatedState.splice(noteStateIndex, 1, updatedNoteState);
  return updatedState;
}
