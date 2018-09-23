import React from 'react';
import { storiesOf } from '@storybook/react';
import { action } from '@storybook/addon-actions';

import { ReviewCard } from './ReviewCard';

const large = {
  width: '600px',
  height: '600px',
};
const small = {
  width: '300px',
  height: '200px',
};

storiesOf('Components|ReviewCard', module)
  .add('large (front)', () => (
    <div style={large}>
      <ReviewCard
        question="短い"
        answer="みじかい"
        onSelectCard={action('onSelectCard')}
      />
    </div>
  ))
  .add('large (back)', () => (
    <div style={large}>
      <ReviewCard
        question="短い"
        answer="みじかい"
        showAnswer
        onSelectCard={action('onSelectCard')}
      />
    </div>
  ))
  .add('small/landscape (front)', () => (
    <div style={small}>
      <ReviewCard
        question="短い"
        answer="みじかい"
        onSelectCard={action('onSelectCard')}
      />
    </div>
  ))
  .add('small/landscape (back)', () => (
    <div style={small}>
      <ReviewCard
        question="短い"
        answer="みじかい"
        showAnswer
        onSelectCard={action('onSelectCard')}
      />
    </div>
  ))
  .add('ruby (front)', () => (
    <div style={large}>
      <ReviewCard
        question="{短|みじか}い"
        answer="みじかい"
        onSelectCard={action('onSelectCard')}
      />
    </div>
  ))
  .add('ruby (back)', () => (
    <div style={large}>
      <ReviewCard
        question="{短|みじか}い"
        answer="{ミジカイ|み|じ|か|い}"
        showAnswer
        onSelectCard={action('onSelectCard')}
      />
    </div>
  ))
  .add('long message (front)', () => (
    <div style={large}>
      <ReviewCard
        question="This is the question that never ends. It just goes on and on my friend. Somebody started writing it not know what it was..."
        answer="This answer is also long, but not quite as long"
        onSelectCard={action('onSelectCard')}
      />
    </div>
  ))
  .add('long message (back)', () => (
    <div style={large}>
      <ReviewCard
        question="This is the question that never ends. It just goes on and on my friend. Somebody started writing it not know what it was..."
        answer="This answer is also long, but not quite as long"
        showAnswer
        onSelectCard={action('onSelectCard')}
      />
    </div>
  ))
  .add('rich text (front)', () => (
    <div style={large}>
      <ReviewCard
        question="􅨐b􅨑Bold􅨜, 􅨐i􅨑italic􅨜, 􅨐u􅨑underline􅨜, 􅨐.􅨑emphasis􅨜"
        answer="􅨐b􅨝i􅨝u􅨝e􅨑Everything at once!􅨜"
        onSelectCard={action('onSelectCard')}
      />
    </div>
  ))
  .add('rich text (back)', () => (
    <div style={large}>
      <ReviewCard
        question="􅨐b􅨑Bold􅨜, 􅨐i􅨑italic􅨜, 􅨐u􅨑underline􅨜, 􅨐.􅨑emphasis􅨜"
        answer="􅨐b􅨝i􅨝u􅨝.􅨑Everything at once!􅨜"
        showAnswer
        onSelectCard={action('onSelectCard')}
      />
    </div>
  ))
  .add('updating (front)', () => <UpdatingReviewCard />)
  .add('malformed rich text (front)', () => (
    <div style={large}>
      <ReviewCard
        question="􅨐b􅨑Bold"
        answer=""
        onSelectCard={action('onSelectCard')}
      />
    </div>
  ));

class State {
  index: number;
}

class UpdatingReviewCard extends React.PureComponent<{}, State> {
  state: State = {
    index: 0,
  };

  strings: Array<string> = [
    '短い',
    '少しだけ長めのやつ',
    'めっっっっっちゃ長～～～～～い。マジで長い。なかなか終わらん。',
  ];

  constructor(props: {}) {
    super(props);
    this.handleClick = this.handleClick.bind(this);
  }

  handleClick(e: React.MouseEvent<HTMLButtonElement>) {
    const index =
      this.state.index + 1 >= this.strings.length ? 0 : this.state.index + 1;
    this.setState({ index });
  }

  render() {
    return (
      <div className="series">
        <div style={large}>
          <ReviewCard
            question={this.strings[this.state.index]}
            answer=""
            onSelectCard={action('onSelectCard')}
          />
        </div>
        <button onClick={this.handleClick}>Update</button>
      </div>
    );
  }
}