import deepEqual from 'deep-equal';
import EditState from '../edit-states';

// Editing state shape:
//
// {
//   forms: {
//     active: {
//       formId: card ID or a sequence number (for yet-to-be-saved cards),
//       editState: EditState,
//       card: { _id: ..., prompt: ..., ... },
//       dirtyFields: [ 'prompt', 'question' etc. ]
//     }
//     [ next: { " " } ]
//     [ prev: { " " } ]
//   }
//   [ saveError ]
// }

const initialState = {
  forms: {
    active: {
      formId: 0,
      editState: EditState.EMPTY,
      card: {},
    },
  },
};

export default function edit(state = initialState, action) {
  switch (action.type) {
    case 'NEW_CARD': {
      return {
        forms: {
          active: { formId: action.id, editState: EditState.EMPTY, card: {} }
        }
      };
    }

    case 'LOAD_CARD': {
      return {
        forms: {
          active: { formId: action.id, editState: EditState.LOADING, card: {} }
        }
      };
    }

    case 'FINISH_LOAD_CARD': {
      if (action.formId !== state.forms.active.formId) {
        return state;
      }

      return {
        forms: {
          active: {
            formId: action.card._id,
            editState: EditState.OK,
            card: action.card,
          }
        }
      };
    }

    case 'FAIL_LOAD_CARD': {
      if (action.formId !== state.forms.active.formId) {
        return state;
      }

      return {
        forms: {
          active: {
            formId: action.formId,
            editState: EditState.NOT_FOUND,
            card: {},
          }
        }
      };
    }

    case 'EDIT_CARD': {
      if (action.formId !== state.forms.active.formId) {
        return state;
      }

      const dirtyFields = Object.keys(action.card).filter(field =>
        field !== '_id' &&
        !deepEqual(action.card[field], state.forms.active.card[field])
      );
      const editState = state.forms.active.editState === EditState.EMPTY ||
                        state.forms.active.editState === EditState.DIRTY_NEW
                        ? EditState.DIRTY_NEW
                        : EditState.DIRTY_EDIT;

      return {
        forms: {
          active: {
            formId: action.formId,
            editState,
            card: { ...state.forms.active.card, ...action.card },
            dirtyFields
          }
        }
      };
    }

    case 'FINISH_SAVE_CARD': {
      if (action.formId !== state.forms.active.formId) {
        return state;
      }

      const dirtyFields = Object.keys(action.card).filter(field =>
        field !== '_id' &&
        !deepEqual(action.card[field], state.forms.active.card[field])
      );
      const editState = dirtyFields.length
                        ? state.forms.active.editState
                        : EditState.OK;

      const result = {
        forms: {
          active: {
            formId: action.card._id,
            editState,
            card: { ...action.card, ...state.forms.active.card },
          }
        }
      };
      if (dirtyFields.length) {
        result.forms.active.dirtyFields = dirtyFields;
      }

      return result;
    }

    case 'FAIL_SAVE_CARD': {
      if (action.formId !== state.forms.active.formId) {
        return state;
      }

      return { forms: state.forms, saveError: action.error };
    }

    case 'SYNC_CARD': {
      const card = {};
      for (const field in action.card) {
        if (action.card.hasOwnProperty(field)) {
          card[field] = state.forms.active.dirtyFields.includes(field)
                        ? state.forms.active.card[field]
                        : action.card[field];
        }
      }

      return {
        forms: {
          active: { ...state.forms.active, card }
        }
      };
    }

    default:
      return state;
  }
}