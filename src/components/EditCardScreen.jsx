import React from 'react';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';

import CardFaceInput from './CardFaceInput.jsx';
import Link from './Link.jsx';

export class EditCardScreen extends React.Component {
  static get propTypes() {
    return {
      active: PropTypes.bool.isRequired,
      card: PropTypes.string,
      onSave: PropTypes.func,
    };
  }

  constructor(props) {
    super(props);

    this.state = { prompt: '', answer: '' };
    this.assignSearchBox = elem => { this.searchBox = elem; };
    this.handleSave = this.handleSave.bind(this);
    this.handlePromptChange = this.handlePromptChange.bind(this);
    this.handleAnswerChange = this.handleAnswerChange.bind(this);
  }

  componentDidMount() {
    if (this.props.active) this.activate();
  }

  componentDidUpdate(previousProps) {
    if (previousProps.active === this.props.active) {
      return;
    }

    if (this.props.active) {
      this.activate();
    } else {
      this.deactivate();
    }
  }

  componentWillUnmount() {
    if (this.props.active) this.deactivate();
  }

  activate() {
    if (!this.props.card && this.searchBox) {
      this.previousFocus = document.activeElement;
      this.searchBox.focus();
    }
  }

  deactivate() {
    if (this.previousFocus) {
      this.previousFocus.focus();
      this.previousFocus = undefined;
    }
  }

  handleSave() {
    if (this.props.onSave) {
      const card = { question: this.state.prompt, answer: this.state.answer };
      this.props.onSave(card);
    }
  }

  handlePromptChange(value) {
    this.setState({ prompt: value });
  }

  handleAnswerChange(value) {
    this.setState({ answer: value });
  }

  render() {
    return (
      <section
        className="edit-screen"
        aria-hidden={!this.props.active} >
        <nav className="buttons tool-bar">
          <div>
            <input
              className="delete -icon -delete -link"
              type="button"
              value="Delete" />
          </div>
          <div className="-center">
            <input
              className="submit -primary -icon -plus"
              type="submit"
              value={this.props.card ? 'OK' : 'Save'}
              onClick={this.handleSave} />
          </div>
          <div>
            <Link
              href="/"
              className="close-button"
              direction="backwards">Close</Link>
          </div>
        </nav>
        <form className="form edit-form" autoComplete="off">
          <div className="search-box">
            <input
              type="text"
              placeholder="Lookup"
              className="text-box -compact -rounded -search"
              ref={this.assignSearchBox} />
          </div>
          <CardFaceInput
            name="prompt"
            className="-textpanel -large"
            placeholder="Prompt"
            required
            onChange={this.handlePromptChange} />
          <CardFaceInput
            name="answer"
            className="-textpanel -large"
            placeholder="Answer"
            onChange={this.handleAnswerChange} />
          <input
            type="text"
            name="keywords"
            className="-textpanel -yellow"
            placeholder="Keywords" />
          <input
            type="text"
            name="tags"
            className="-textpanel"
            placeholder="Tags" />
        </form>
      </section>
    );
  }
}

const mapDispatchToProps = dispatch => ({
  onSave: card => { dispatch({ type: 'SAVE_CARD', card }); }
});

export default connect(null, mapDispatchToProps)(EditCardScreen);
