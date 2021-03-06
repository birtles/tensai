import { Action } from 'redux';
import { Note } from '../model';
import { StoreError } from '../store/DataStore';

export interface EditScreenContext {
  screen: 'edit-card';
  cardFormId: number;
}

interface ReviewScreenContext {
  screen: 'review';
}

export type NoteListContext = EditScreenContext | ReviewScreenContext;

interface NoteContextCommon {
  noteFormId: number;
}

export type EditNoteContext = EditScreenContext & NoteContextCommon;
export type ReviewNoteContext = ReviewScreenContext & NoteContextCommon;
export type NoteContext = EditNoteContext | ReviewNoteContext;

export type NoteAction =
  | AddNoteAction
  | EditNoteAction
  | SaveNoteAction
  | FinishSaveNoteAction
  | FailSaveNoteAction
  | DeleteNoteAction
  | UpdateNoteListAction;

export const isNoteAction = (action: Action): action is NoteAction =>
  [
    'ADD_NOTE',
    'EDIT_NOTE',
    'SAVE_NOTE',
    'FINISH_SAVE_NOTE',
    'FAIL_SAVE_NOTE',
    'DELETE_NOTE',
    'UPDATE_NOTE_LIST',
  ].includes(action.type);

let id = 0;

// Generate a unique sequence number for each new note. (Technically this only
// needs to be unique per context but it's just easier to make it globally
// unique.) As with cards, we include this as part of the action so that reducer
// remains stateless.
function newFormId(): number {
  return ++id;
}

export interface AddNoteAction {
  type: 'ADD_NOTE';
  context: NoteContext;
  initialKeywords?: string[];
}

export function addNote(
  context: NoteListContext,
  initialKeywords?: string[]
): AddNoteAction {
  return {
    type: 'ADD_NOTE',
    context: {
      ...context,
      noteFormId: newFormId(),
    },
    initialKeywords,
  };
}

// Overload for unit testing that allows us to force the ID to a particular
// number to make tests more independent.
export function addNoteWithNewFormId(
  context: NoteListContext,
  noteFormId: number,
  initialKeywords?: string[]
): AddNoteAction {
  return {
    type: 'ADD_NOTE',
    context: {
      ...context,
      noteFormId,
    },
    initialKeywords,
  };
}

export interface EditNoteAction {
  type: 'EDIT_NOTE';
  context: NoteContext;
  change: Partial<Note>;
}

export function editNote(
  context: NoteContext,
  change: Partial<Note>
): EditNoteAction {
  return {
    type: 'EDIT_NOTE',
    context,
    change,
  };
}

export interface SaveNoteAction {
  type: 'SAVE_NOTE';
  context: NoteContext;
}

export function saveNote(context: NoteContext): SaveNoteAction {
  return {
    type: 'SAVE_NOTE',
    context,
  };
}

export interface FinishSaveNoteAction {
  type: 'FINISH_SAVE_NOTE';
  context: NoteContext;
  note: Partial<Note>;
}

export function finishSaveNote(
  context: NoteContext,
  savedNote: Partial<Note>
): FinishSaveNoteAction {
  return {
    type: 'FINISH_SAVE_NOTE',
    context,
    note: savedNote,
  };
}

export interface FailSaveNoteAction {
  type: 'FAIL_SAVE_NOTE';
  context: NoteContext;
  error: StoreError;
}

export function failSaveNote(
  context: NoteContext,
  error: StoreError
): FailSaveNoteAction {
  return {
    type: 'FAIL_SAVE_NOTE',
    context,
    error,
  };
}

export interface DeleteNoteAction {
  type: 'DELETE_NOTE';
  context: NoteContext;
  noteId?: string;
}

export function deleteNote(
  context: NoteContext,
  noteId?: string
): DeleteNoteAction {
  return {
    type: 'DELETE_NOTE',
    context,
    noteId,
  };
}

export interface UpdateNoteListAction {
  type: 'UPDATE_NOTE_LIST';
  context: NoteListContext;
  notes: Array<Note>;
  // The notes which were deleted in this update. There is a difference between
  // a note disappearing from |notes| and also appearing in |deletedNoteIds|.
  //
  // A note that no longer matches the keywords will be dropped from |notes| and
  // will not be displayed unless it has been touched in the current edit
  // session.
  //
  // On the other hand, a note that is dropped from |notes| but also appears in
  // |deletedNoteIds| has actually been deleted (either remotely or locally) and
  // should not be displayed even if it has been touched.
  deletedNoteIds: Set<string>;
  // An array of form IDs to use should this action produce new note forms.
  // There should be at least as many items in this array as in |notes|.
  noteFormIds: Array<number>;
}

export function updateNoteList(
  context: NoteListContext,
  notes: Array<Note>,
  deletedNoteIds: Array<string> = []
): UpdateNoteListAction {
  const noteFormIds = notes.map(() => newFormId());
  return {
    type: 'UPDATE_NOTE_LIST',
    context,
    notes,
    deletedNoteIds: new Set<string>(deletedNoteIds),
    noteFormIds,
  };
}

// Overload for unit testing that allows us to force the IDs to a particular
// values to make tests more independent.
export function updateNoteListWithNewFormIds(
  context: NoteListContext,
  notes: Array<Note>,
  noteFormIds: Array<number>
): UpdateNoteListAction {
  return {
    type: 'UPDATE_NOTE_LIST',
    context,
    notes,
    deletedNoteIds: new Set<string>(),
    noteFormIds,
  };
}
