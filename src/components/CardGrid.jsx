import React from 'react';
import CardPreview from './CardPreview.jsx';

export class CardGrid extends React.Component {
  static get propTypes() {
    return {
      cards: React.PropTypes.arrayOf(React.PropTypes.shape({
        _id: React.PropTypes.string.isRequired,
        question: React.PropTypes.string.isRequired,
      })).isRequired,
      onDelete: React.PropTypes.func.isRequired,
    };
  }

  render() {
    return (
      <div className="card-grid">
        {
          this.props.cards.map(
            card => <CardPreview key={card._id}
              onDelete={this.props.onDelete} {...card} />
          )
        }
      </div>
    );
  }
}

export default CardGrid;
