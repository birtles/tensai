import React from 'react';

function getScrollContainer(elem) {
  if (elem === null) {
    return null;
  }

  return elem.scrollHeight > elem.clientHeight
         ? elem
         : getScrollContainer(elem.parentNode);
}

// Record the number of potentially recursive calls to updateLayout. This is
// mostly a safeguard to ensure we don't end up rendering recursively without
// limit.
//
// This could happen, for example, if we update layout, determine the size of
// items, trigger a render based on that size. Then, suppose that render with
// the new size means we now need scrollbars. Then if we update layout again we
// might decide to render the items at a smaller size (due to narrower area)
// which might mean we don't overflow the screen anymore and no longer need
// scroll bars, and so on.
//
// React's lifecycle actually makes it quite hard to detect this case so we
// simply update the below when we *think* we are triggering a render and clear
// it any time return early from updating layout. If the depth gets greater than
// 2, then we just bail.
//
// We also use this to detect when the layout has changed so we know if we need
// to re-check the computed style after the DOM has been updated.
let layoutRenderDepth = 0;

export class VirtualGrid extends React.Component {
  static get propTypes() {
    return {
      items: React.PropTypes.arrayOf(React.PropTypes.shape({
        _id: React.PropTypes.string.isRequired,
      })).isRequired,
      renderItem: React.PropTypes.func.isRequired,
      renderTemplateItem: React.PropTypes.func.isRequired,
      className: React.PropTypes.string,
    };
  }

  constructor(props) {
    super(props);
    this.state = { itemWidth: null,
                   itemHeight: null,
                   itemsPerRow: 1,
                   itemScale: 1,
                   startIndex: 0,
                   endIndex: 0,
                   containerHeight: null,
                   slots: [],
                   deletingItems: {} };

    // Ref callbacks
    this.assignGrid = elem => { this.grid = elem; };
    this.assignItemTemplate = elem => {
      this.templateItem = elem;
      if (this.scrollContainer) {
        this.scrollContainer.removeEventListener('scroll',
                                                 this.handleScroll,
                                                 { passive: true });
      }
      this.scrollContainer = getScrollContainer(elem);
      if (this.scrollContainer) {
        this.scrollContainer.addEventListener('scroll',
                                              this.handleScroll,
                                              { passive: true });
      }
    };

    // Event callbacks
    this.handleResize = this.handleResize.bind(this);
    this.handleScroll = this.handleScroll.bind(this);
  }

  componentDidMount() {
    const layout = this.updateLayout();
    this.updateVisibleRange(layout);
    window.addEventListener('resize', this.handleResize);
  }

  componentWillReceiveProps(nextProps) {
    // This is a new render cycle, so reset the render depth.
    layoutRenderDepth = 0;

    let needsRangeUpdate = false;

    // The only thing the can trigger a change to layout is a change in the
    // number of items.
    let layout = false;
    if (this.props.items.length !== nextProps.items.length) {
      needsRangeUpdate = true;
      layout = this.updateLayout(nextProps.items);
    }

    // We will only call this if the number of items has *not* changed so we can
    // assume that the two items arrays have the same length.
    const visibleItemIndicesHaveChanged = () => {
      for (let i = this.state.startIndex; i < this.state.endIndex; i++) {
        if (this.props.items[i]._id !== nextProps.items[i]._id) {
          return true;
        }
      }
      return false;
    };

    if (needsRangeUpdate || visibleItemIndicesHaveChanged()) {
      // Generate a slot assignment mapping for existing items so we can keep
      // them in the same slots if they are still visible.
      const slotAssignment = {};
      this.state.slots.forEach((itemIndex, i) => {
        if (typeof itemIndex === 'number') {
          slotAssignment[this.props.items[itemIndex]._id] = i;
        } else if (typeof itemIndex === 'string') {
          slotAssignment[itemIndex] = i;
        }
      });

      this.updateVisibleRange(layout, nextProps.items, slotAssignment);
    }
  }

  componentDidUpdate() {
    // If we updated layout before the last render, check if the size of
    // items in the DOM has changed. This might happen, for example, if media
    // queries were applied based on the new viewport size.
    if (!layoutRenderDepth) {
      return;
    }

    const layout = this.updateLayout();
    if (layout) {
      this.updateVisibleRange(layout);
    }
  }

  componentWillUnmount() {
    window.removeEventListener('resize', this.handleResize);
    if (this.scrollContainer) {
      this.scrollContainer.removeEventListener('scroll',
                                               this.handleScroll,
                                               { passive: true });
    }
  }

  handleResize() {
    const layout = this.updateLayout();
    // Regardless of the return value of updateLayout, we need to update the
    // visible range since more items may now be in view even if their size has
    // not changed.
    this.updateVisibleRange(layout);
  }

  handleScroll() {
    this.updateVisibleRange();
  }

  // Recalculates the size of items based on the computed style of a hidden
  // dummy item in the DOM. Also, updates the scroll height of the container to
  // reflect the number of items available.
  //
  // @param nextItems An optional parameter specifying the to-be-set array of
  //                  items. If this is not provided, the current items (stored
  //                  in props) are used.
  //
  // Returns the updated layout if it changed, false otherwise.
  updateLayout(nextItems) {
    if (!this.grid || !this.templateItem) {
      layoutRenderDepth = 0;
      return false;
    }

    // Detect possible infinite layout behavior
    if (layoutRenderDepth > 2) {
      layoutRenderDepth = 0;
      return false;
    }

    const items = nextItems || this.props.items;

    if (!items.length) {
      if (this.state.containerHeight === 0) {
        layoutRenderDepth = 0;
        return false;
      }

      layoutRenderDepth++;
      this.setState({ containerHeight: 0 });
      return { itemWidth: null,
               itemHeight: null,
               itemsPerRow: 1,
               itemScale: 1,
               containerHeight: 0 };
    }

    // We want to be able to define the item size using the stylesheet (e.g.
    // so we can use media queries to change the size) but, at the same time,
    // we assume all items are the same size since that allows us to optimize
    // the layout to only produce a limited set of DOM nodes.
    // To do that we use a representative template item to get the initial size.

    const bbox     = this.templateItem.getBoundingClientRect();
    let itemWidth  = bbox.width;
    let itemHeight = bbox.height;

    // Adjust item width to make full use of the available screen space.
    // If less than 20% of an item is overhanging the edge, shrink all the
    // items, otherwise stretch them all.
    const gridWidth = this.grid.offsetWidth;
    let itemsPerRow = gridWidth / itemWidth;
    if (itemsPerRow % 1 < 0.2) {
      itemsPerRow = Math.floor(itemsPerRow);
    } else {
      itemsPerRow = Math.ceil(itemsPerRow);
    }

    const itemScale = gridWidth / itemsPerRow / itemWidth;

    itemWidth  = Math.floor(itemWidth * itemScale);
    itemHeight = Math.floor(itemHeight * itemScale);

    const containerHeight = Math.ceil(items.length / itemsPerRow) *
                            itemHeight;

    if (this.state.itemsPerRow     === itemsPerRow &&
        this.state.itemWidth       === itemWidth &&
        this.state.itemHeight      === itemHeight &&
        this.state.itemScale       === itemScale &&
        this.state.containerHeight === containerHeight) {
      layoutRenderDepth = 0;
      return false;
    }

    layoutRenderDepth++;
    const layout = { itemsPerRow,
                     itemWidth,
                     itemHeight,
                     itemScale,
                     containerHeight };
    this.setState(layout);
    return layout;
  }

  // Recalculates the assignment of items to slots. This needs to be performed
  // whenever layout is updated but also whenever a scroll takes place or the
  // viewport is resized.
  //
  // @params nextLayout An optional parameter specifying the layout to use.
  //
  // @param nextItems An optional parameter specifying the to-be-set array of
  //                  items. If this is not provided, the current items (stored
  //                  in props) are used.
  //
  // @param slotAssignment An optional parameter that may be provided together
  //                       with nextItems that maps item IDs for the *current*
  //                       set of properties to slots. This is used so that we
  //                       can ensure existing items that remain in view are
  //                       assigned to the same slot even when the set of items
  //                       is being updated.
  //
  // Returns true if the size changed, false otherwise.
  updateVisibleRange(nextLayout, nextItems, slotAssignment) {
    const layout = nextLayout || { itemWidth: this.state.itemWidth,
                                   itemHeight: this.state.itemHeight,
                                   itemsPerRow: this.state.itemsPerRow,
                                   itemScale: this.state.itemScale,
                                   containerHeight:
                                     this.state.containerHeight };
    // We haven't finished doing the initial layout yet
    if (!layout.itemWidth || !layout.itemHeight) {
      return;
    }

    const items = nextItems || this.props.items;

    let startIndex;
    let endIndex;

    if (this.scrollContainer) {
      // Calculate visible height
      const upperBound = Math.max(this.scrollContainer.scrollTop -
                                  this.grid.offsetTop, 0);
      const lowerBound = this.scrollContainer.offsetHeight -
                         this.grid.offsetTop +
                         this.scrollContainer.scrollTop;

      const firstVisibleRow = Math.floor(upperBound / layout.itemHeight);
      const lastVisibleRow  = Math.ceil(lowerBound / layout.itemHeight);

      startIndex = firstVisibleRow * layout.itemsPerRow;
      endIndex   = Math.min((lastVisibleRow + 1) * layout.itemsPerRow,
                            items.length);
    } else {
      // No scroll container? All the items must be visible, I guess.
      startIndex = 0;
      endIndex = items.length;
    }

    if (!slotAssignment &&
        this.state.startIndex === startIndex &&
        this.state.endIndex === endIndex) {
      return;
    }

    // Update slots
    const slots = this.state.slots.slice();

    // Collect empty and existing slots
    let emptySlots = [];
    const existingItems = [];
    const deletingItems = {};
    if (slotAssignment) {
      slots.fill(null);
      // Fill in existing items that are still in range
      for (let i = startIndex; i < endIndex; i++) {
        const existingSlot = slotAssignment[items[i]._id];
        if (typeof existingSlot === 'number') {
          slots[existingSlot] = i;
          existingItems[i] = existingSlot;
          delete slotAssignment[items[i]._id];
        }
      }
      console.log('After filling in existing items we still have the following'
                  + ' in the slot assignments '
                  + JSON.stringify(slotAssignment));
      // Detect and store any newly-deleted items that would still be in range
      for (const [ id, slot ] of Object.entries(slotAssignment)) {
        console.log(`Processing [${id}, ${slot}] from slotAssignment`);
        const previousIndex = this.state.slots[slot];
        console.log(`Previous index was ${previousIndex}`);
        if (previousIndex < startIndex || previousIndex >= endIndex) {
          console.log('No longer in range, skipping');
          continue;
        }
        const existingRecord = this.state.deletingItems[id];
        if (existingRecord) {
          console.log('Found an existing record, copying');
          console.log(`Existing record: ${JSON.stringify(existingRecord)}`);
          deletingItems[id] = existingRecord;
        } else {
          console.log('Adding new record to deletingItems');
          deletingItems[id] = {
            item: this.props.items[previousIndex],
            index: previousIndex,
          };
          console.log(`deletingItems now: ${JSON.stringify(deletingItems)}`);
        }
        slots[slot] = id;
      }
      console.log(`deletingItems at end: ${JSON.stringify(deletingItems)}`);
      emptySlots = slots.map((slot, i) => (slot === null ? i : null))
                        .filter(slot => slot !== null);
      console.log(`emptySlots: ${JSON.stringify(emptySlots)}`);
    } else {
      slots.forEach((itemIndex, i) => {
        if (itemIndex === null ||
            itemIndex < startIndex ||
            itemIndex >= endIndex) {
          emptySlots.push(i);
        } else {
          existingItems[itemIndex] = i;
        }
      });
    }

    // Fill in missing items
    for (let i = startIndex; i < endIndex; i++) {
      if (typeof existingItems[i] === 'number') {
        continue;
      }
      if (emptySlots.length) {
        const emptyIndex = emptySlots.pop();
        slots[emptyIndex] = i;
      } else {
        slots.push(i);
      }
    }

    this.setState({ startIndex, endIndex, slots, deletingItems });
  }

  render() {
    const containerHeight = this.state.containerHeight === null
                            ? window.innerHeight + 10
                            : this.state.containerHeight;
    const gridStyle = { height: `${containerHeight}px` };
    const scale = `scale(${this.state.itemScale})`;

    return (
      <div
        className={this.props.className}
        ref={this.assignGrid}
        style={gridStyle}>
        <div
          style={{ opacity: 0, pointerEvents: 'none' }}
          ref={this.assignItemTemplate}>
          {this.props.renderTemplateItem()}
        </div>
        {
          this.state.slots.map((ref, i) => {
            const classes = [ 'grid-item' ];
            console.log(`Rendering [${ref}, ${i}]`);

            let item;
            let itemIndex;
            if (typeof ref === 'string') {
              const deletingRecord = this.state.deletingItems[ref];
              item = deletingRecord.item;
              itemIndex = deletingRecord.index;
              classes.push('deleting');
              // XXX Need to register an event listener somewhere to catch
              // transitionend / transitioncancel events and drop the
              // appropriate element from deletingItems at that time
            } else {
              item = this.props.items[ref];
              itemIndex = ref;
            }
            console.log(`${itemIndex} @ ${JSON.stringify(item)}`);

            // This is probably only needed until we make the slot assignment
            // work in the face of deletion.
            if (!item) {
              // XXX Is this needed now?
              return null;
            }
            const row = Math.floor(itemIndex / this.state.itemsPerRow);
            const col = itemIndex % this.state.itemsPerRow;
            const translate = `translate(${col * this.state.itemWidth}px, ` +
                                        `${row * this.state.itemHeight}px)`;

            return (
              <div
                style={{ transform: `${translate} ${scale}` }}
                className={classes.join(' ')}
                // eslint-disable-next-line react/no-array-index-key
                key={i}>
                {this.props.renderItem(item)}
              </div>);
          })
        }
      </div>
    );
  }
}

export default VirtualGrid;
