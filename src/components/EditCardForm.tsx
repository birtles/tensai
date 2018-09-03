import React from 'react';
import PropTypes from 'prop-types';

import CardFaceInput from './CardFaceInput';
import {
  CardFormatToolbar,
  FormatButtonCommand,
  FormatButtonConfig,
  FormatButtonState,
} from './CardFormatToolbar';
import KeywordSuggestionProvider from './KeywordSuggestionProvider';
import TagSuggestionProvider from './TagSuggestionProvider';
import TokenList from './TokenList';

import { Card } from '../model';
import KeywordSuggester from '../suggestions/KeywordSuggester';
import TagSuggester from '../suggestions/TagSuggester';

interface Props {
  card: Partial<Card>;
  onChange?: (topic: string, value: string | string[]) => void;
}

interface State {
  keywordsText: string;
  tagsText: string;
  textAreaFocussed: boolean;
  mostRecentFace: 'prompt' | 'answer';
  currentMarks: Set<string>;
}

export class EditCardForm extends React.Component<Props, State> {
  static get propTypes() {
    return {
      // eslint-disable-next-line react/forbid-prop-types
      card: PropTypes.object.isRequired,
      onChange: PropTypes.func,
    };
  }

  state: State = {
    keywordsText: '',
    tagsText: '',
    textAreaFocussed: false,
    mostRecentFace: 'prompt',
    currentMarks: new Set<string>(),
  };

  questionTextBoxRef: React.RefObject<CardFaceInput>;
  answerTextBoxRef: React.RefObject<CardFaceInput>;
  formatToolbarRef: React.RefObject<CardFormatToolbar>;
  keywordsTokenListRef: React.RefObject<TokenList>;
  tagsTokenListRef: React.RefObject<TokenList>;

  handlePromptChange: (value: 'string') => void;
  handleAnswerChange: (value: 'string') => void;
  handlePromptMarksUpdated: (marks: Set<string>) => void;
  handleAnswerMarksUpdated: (marks: Set<string>) => void;
  handlePromptSelectRange: () => void;
  handleAnswerSelectRange: () => void;

  debouncedUpdateSuggestions: {
    tags: (text: string) => void;
  };

  constructor(props: Props) {
    super(props);

    this.questionTextBoxRef = React.createRef<CardFaceInput>();
    this.answerTextBoxRef = React.createRef<CardFaceInput>();
    this.formatToolbarRef = React.createRef<CardFormatToolbar>();
    this.keywordsTokenListRef = React.createRef<TokenList>();
    this.tagsTokenListRef = React.createRef<TokenList>();

    this.handlePromptChange = this.handleTextBoxChange.bind(this, 'question');
    this.handlePromptSelectRange = this.handleSelectRange.bind(this, 'prompt');
    this.handlePromptMarksUpdated = this.handleMarksUpdated.bind(
      this,
      'prompt'
    );

    this.handleAnswerChange = this.handleTextBoxChange.bind(this, 'answer');
    this.handleAnswerSelectRange = this.handleSelectRange.bind(this, 'answer');
    this.handleAnswerMarksUpdated = this.handleMarksUpdated.bind(
      this,
      'answer'
    );

    this.handleFormat = this.handleFormat.bind(this);

    this.handleBlur = this.handleBlur.bind(this);
    this.handleFocus = this.handleFocus.bind(this);

    // Token lists
    this.handleKeywordsClick = this.handleKeywordsClick.bind(this);
    this.handleKeywordsTextChange = this.handleKeywordsTextChange.bind(this);
    this.handleTagsClick = this.handleTagsClick.bind(this);
    this.handleTagsTextChange = this.handleTagsTextChange.bind(this);
  }

  get currentFace(): CardFaceInput | null {
    return this.state.mostRecentFace === 'prompt'
      ? this.questionTextBoxRef.current
      : this.answerTextBoxRef.current;
  }

  handleTextBoxChange(field: 'question' | 'answer', value: string) {
    if (this.props.onChange) {
      this.props.onChange(field, value);
    }
  }

  handleSelectRange(face: 'prompt' | 'answer') {
    if (this.state.mostRecentFace === face) {
      return;
    }

    const stateUpdate: Partial<State> = {
      mostRecentFace: face,
    };
    const textBoxRef =
      face === 'prompt' ? this.questionTextBoxRef : this.answerTextBoxRef;
    if (textBoxRef.current) {
      stateUpdate.currentMarks = textBoxRef.current.getCurrentMarks();
    }
    this.setState(stateUpdate as State);

    const otherTextBoxRef =
      face === 'prompt' ? this.answerTextBoxRef : this.questionTextBoxRef;
    if (otherTextBoxRef.current) {
      otherTextBoxRef.current.collapseSelection();
    }
  }

  handleMarksUpdated(face: 'prompt' | 'answer', marks: Set<string>) {
    if (this.state.mostRecentFace !== face) {
      return;
    }

    this.setState({ currentMarks: marks });
  }

  handleFormat(command: FormatButtonCommand) {
    if (!this.currentFace) {
      return;
    }

    if (command === 'bold' || command === 'italic' || command === 'underline') {
      this.currentFace.toggleMark(command);
    }
  }

  handleBlur(e: React.FocusEvent<any>) {
    // Unconditionally set this to false. We'll set it to true when we get he
    // subsequent focus event if necessary.
    this.setState({ textAreaFocussed: false });
  }

  handleFocus(e: React.FocusEvent<any>) {
    // Check if the focus is in either of the card face textboxes
    const textboxes: Array<React.RefObject<CardFaceInput>> = [
      this.questionTextBoxRef,
      this.answerTextBoxRef,
    ];
    for (const textbox of textboxes) {
      if (
        textbox.current &&
        textbox.current.element &&
        textbox.current.element.contains(e.target as HTMLElement)
      ) {
        this.setState({ textAreaFocussed: true });
        return;
      }
    }

    // Check if the focus is in the format toolbar
    if (
      this.formatToolbarRef.current &&
      this.formatToolbarRef.current.element &&
      this.formatToolbarRef.current.element.contains(e.target as HTMLElement)
    ) {
      this.setState({ textAreaFocussed: true });
    }
  }

  handleKeywordsClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!e.defaultPrevented && this.keywordsTokenListRef.current) {
      this.keywordsTokenListRef.current.focus();
    }
  }

  handleKeywordsTextChange(text: string) {
    this.setState({ keywordsText: text });
  }

  handleKeywordsChange(
    keywords: string[],
    addedKeywords: string[],
    addRecentEntry: (entry: string) => void
  ) {
    if (this.props.onChange) {
      this.props.onChange('keywords', keywords);
    }

    for (const keyword of addedKeywords) {
      addRecentEntry(keyword);
    }
  }

  handleTagsClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!e.defaultPrevented && this.tagsTokenListRef.current) {
      this.tagsTokenListRef.current.focus();
    }
  }

  handleTagsTextChange(text: string) {
    this.setState({ tagsText: text });
  }

  handleTagsChange(
    tags: string[],
    addedTags: string[],
    addRecentEntry: (entry: string) => void
  ) {
    if (this.props.onChange) {
      this.props.onChange('tags', tags);
    }

    for (const tag of addedTags) {
      addRecentEntry(tag);
    }
  }

  get formatButtonConfig(): Array<FormatButtonConfig> {
    let currentMarks: Set<string> | undefined;
    if (this.state.textAreaFocussed) {
      currentMarks = this.state.currentMarks;
    }
    const hasMark = (style: string): boolean =>
      currentMarks ? currentMarks.has(style) : false;

    const buttons: Array<FormatButtonConfig> = [
      {
        type: 'bold',
        label: 'Bold',
        accelerator: 'Ctrl+B',
        state: hasMark('bold')
          ? FormatButtonState.Set
          : FormatButtonState.Normal,
      },
      {
        type: 'italic',
        label: 'Italic',
        accelerator: 'Ctrl+I',
        state: hasMark('italic')
          ? FormatButtonState.Set
          : FormatButtonState.Normal,
      },
      {
        type: 'underline',
        label: 'Underline',
        accelerator: 'Ctrl+U',
        state: hasMark('underline')
          ? FormatButtonState.Set
          : FormatButtonState.Normal,
      },
      {
        type: 'emphasis',
        label: 'Dot emphasis',
        accelerator: 'Ctrl+.',
        state: hasMark('emphasis')
          ? FormatButtonState.Set
          : FormatButtonState.Normal,
      },
    ];

    return buttons;
  }

  render() {
    const keywordSuggestions = KeywordSuggester.getSuggestionsFromCard(
      this.props.card
    );

    return (
      <form
        className="form editcard-form"
        autoComplete="off"
        onFocus={this.handleFocus}
        onBlur={this.handleBlur}
      >
        <CardFaceInput
          className="prompt"
          value={this.props.card.question || ''}
          placeholder="Prompt"
          onChange={this.handlePromptChange}
          onSelectRange={this.handlePromptSelectRange}
          onMarksUpdated={this.handlePromptMarksUpdated}
          ref={this.questionTextBoxRef}
        />
        <hr className="card-divider divider" />
        <CardFaceInput
          className="answer"
          value={this.props.card.answer || ''}
          placeholder="Answer"
          onChange={this.handleAnswerChange}
          onSelectRange={this.handleAnswerSelectRange}
          onMarksUpdated={this.handleAnswerMarksUpdated}
          ref={this.answerTextBoxRef}
        />
        <CardFormatToolbar
          className={
            'toolbar -center' +
            (this.state.textAreaFocussed ? ' -areafocus' : '')
          }
          onClick={this.handleFormat}
          buttons={this.formatButtonConfig}
          ref={this.formatToolbarRef}
        />
        <div
          className="keywords -yellow"
          onClick={this.handleKeywordsClick}
          title="Add words here to cross-reference with notes and other resources. For example, if this card is about &ldquo;running&rdquo;, adding &ldquo;run&rdquo; as a keyword will make it easy to find related notes, pictures, and dictionary entries."
        >
          <span className="icon -key" />
          <KeywordSuggestionProvider
            text={this.state.keywordsText}
            defaultSuggestions={keywordSuggestions}
            includeRecentKeywords={true}
          >
            {(
              suggestions: string[],
              loading: boolean,
              addRecentEntry: (entry: string) => void
            ) => (
              <TokenList
                className="tokens -yellow -seamless"
                tokens={this.props.card.keywords || []}
                placeholder="Keywords"
                onTokensChange={(
                  keywords: string[],
                  addedKeywords: string[]
                ) => {
                  this.handleKeywordsChange(
                    keywords,
                    addedKeywords,
                    addRecentEntry
                  );
                }}
                onTextChange={this.handleKeywordsTextChange}
                suggestions={suggestions}
                loadingSuggestions={loading}
                ref={this.keywordsTokenListRef}
              />
            )}
          </KeywordSuggestionProvider>
        </div>
        <div
          className="tags"
          onClick={this.handleTagsClick}
          title="Add labels here to help organize your cards such as &ldquo;vocabulary&rdquo;, &ldquo;Intermediate French Conversation&rdquo;, &ldquo;Needs picture&rdquo; etc."
        >
          <span className="icon -tag -grey" />
          <TagSuggestionProvider text={this.state.tagsText}>
            {(
              suggestions: string[],
              loading: boolean,
              addRecentEntry: (entry: string) => void
            ) => (
              <TokenList
                className="tokens -seamless"
                tokens={this.props.card.tags || []}
                placeholder="Tags"
                onTokensChange={(tags: string[], addedTags: string[]) => {
                  this.handleTagsChange(tags, addedTags, addRecentEntry);
                }}
                onTextChange={this.handleTagsTextChange}
                suggestions={suggestions}
                loadingSuggestions={loading}
                ref={this.tagsTokenListRef}
              />
            )}
          </TagSuggestionProvider>
        </div>
      </form>
    );
  }
}

export default EditCardForm;
