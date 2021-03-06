import * as React from 'react';

import { TagSuggesterContext } from './TagSuggesterContext';
import {
  SuggestionProvider,
  SuggestionProviderProps,
} from './SuggestionProvider';
import { SuggestionResult } from '../suggestions/SuggestionResult';
import { TagSuggester } from '../suggestions/TagSuggester';

interface PropsInner extends SuggestionProviderProps {
  tagSuggester: TagSuggester;
}

class TagSuggestionProviderInner extends SuggestionProvider<PropsInner> {
  addRecentEntry: (entry: string) => void;

  constructor(props: PropsInner) {
    super(props);

    this.addRecentEntry = props.tagSuggester.recordRecentTag.bind(
      props.tagSuggester
    );
  }

  getSuggestions(): SuggestionResult {
    return this.props.tagSuggester.getSuggestions(this.props.text || '');
  }
}

// See KeywordSuggestionProvider for rationale for taking a possibly
// undefined TagSuggester then asserting it is defined.
export const TagSuggestionProvider = (props: SuggestionProviderProps) => (
  <TagSuggesterContext.Consumer>
    {(tagSuggester?: TagSuggester) => (
      <TagSuggestionProviderInner {...props} tagSuggester={tagSuggester!} />
    )}
  </TagSuggesterContext.Consumer>
);
