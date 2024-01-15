import yogaModule from 'yoga-layout/sync';

// yoga-layout sets default export using non-standard __esModule property, so we need to
// make an additional check in case it's used in a bundler that does not support it.
const Yoga = 'default' in yogaModule ? yogaModule.default : yogaModule;

/**
 * Set display attribute to node's Yoga instance
 *
 * @param {String} display
 * @param {Object} node instance
 * @return {Object} node instance
 */
const setDisplay = value => node => {
  const { yogaNode } = node;

  if (yogaNode) {
    yogaNode.setDisplay(
      value === 'none' ? Yoga.DISPLAY_NONE : Yoga.DISPLAY_FLEX,
    );
  }

  return node;
};

export default setDisplay;
