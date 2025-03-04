import lodashGet from 'lodash/get';
import PropTypes from 'prop-types';
import React, {Component} from 'react';
import {ScrollView, View} from 'react-native';
import _ from 'underscore';
import ArrowKeyFocusManager from '@components/ArrowKeyFocusManager';
import Button from '@components/Button';
import FixedFooter from '@components/FixedFooter';
import FormHelpMessage from '@components/FormHelpMessage';
import Icon from '@components/Icon';
import {Info} from '@components/Icon/Expensicons';
import OptionsList from '@components/OptionsList';
import {PressableWithoutFeedback} from '@components/Pressable';
import ShowMoreButton from '@components/ShowMoreButton';
import Text from '@components/Text';
import TextInput from '@components/TextInput';
import withLocalize, {withLocalizePropTypes} from '@components/withLocalize';
import withNavigationFocus from '@components/withNavigationFocus';
import withTheme, {withThemePropTypes} from '@components/withTheme';
import withThemeStyles, {withThemeStylesPropTypes} from '@components/withThemeStyles';
import compose from '@libs/compose';
import getPlatform from '@libs/getPlatform';
import KeyboardShortcut from '@libs/KeyboardShortcut';
import Navigation from '@libs/Navigation/Navigation';
import setSelection from '@libs/setSelection';
import CONST from '@src/CONST';
import ROUTES from '@src/ROUTES';
import {defaultProps as optionsSelectorDefaultProps, propTypes as optionsSelectorPropTypes} from './optionsSelectorPropTypes';

const propTypes = {
    /** padding bottom style of safe area */
    safeAreaPaddingBottomStyle: PropTypes.oneOfType([PropTypes.arrayOf(PropTypes.object), PropTypes.object]),

    /** Content container styles for OptionsList */
    contentContainerStyles: PropTypes.oneOfType([PropTypes.arrayOf(PropTypes.object), PropTypes.object]),

    /** List container styles for OptionsList */
    listContainerStyles: PropTypes.oneOfType([PropTypes.arrayOf(PropTypes.object), PropTypes.object]),

    /** List styles for OptionsList */
    listStyles: PropTypes.oneOfType([PropTypes.arrayOf(PropTypes.object), PropTypes.object]),

    /** Whether navigation is focused */
    isFocused: PropTypes.bool.isRequired,

    /** Whether referral CTA should be displayed */
    shouldShowReferralCTA: PropTypes.bool,

    /** Referral content type */
    referralContentType: PropTypes.string,

    ...optionsSelectorPropTypes,
    ...withLocalizePropTypes,
    ...withThemeStylesPropTypes,
    ...withThemePropTypes,
};

const defaultProps = {
    shouldDelayFocus: false,
    shouldShowReferralCTA: false,
    referralContentType: CONST.REFERRAL_PROGRAM.CONTENT_TYPES.REFER_FRIEND,
    safeAreaPaddingBottomStyle: {},
    contentContainerStyles: [],
    listContainerStyles: undefined,
    listStyles: [],
    ...optionsSelectorDefaultProps,
};

class BaseOptionsSelector extends Component {
    constructor(props) {
        super(props);

        this.updateFocusedIndex = this.updateFocusedIndex.bind(this);
        this.scrollToIndex = this.scrollToIndex.bind(this);
        this.selectRow = this.selectRow.bind(this);
        this.handleReferralModal = this.handleReferralModal.bind(this);
        this.selectFocusedOption = this.selectFocusedOption.bind(this);
        this.addToSelection = this.addToSelection.bind(this);
        this.updateSearchValue = this.updateSearchValue.bind(this);
        this.incrementPage = this.incrementPage.bind(this);
        this.sliceSections = this.sliceSections.bind(this);
        this.calculateAllVisibleOptionsCount = this.calculateAllVisibleOptionsCount.bind(this);
        this.debouncedUpdateSearchValue = _.debounce(this.updateSearchValue, CONST.TIMING.SEARCH_OPTION_LIST_DEBOUNCE_TIME);
        this.relatedTarget = null;

        const allOptions = this.flattenSections();
        const sections = this.sliceSections();
        const focusedIndex = this.getInitiallyFocusedIndex(allOptions);

        this.state = {
            sections,
            allOptions,
            focusedIndex,
            shouldDisableRowSelection: false,
            shouldShowReferralModal: false,
            errorMessage: '',
            paginationPage: 1,
            value: '',
        };
    }

    componentDidMount() {
        this.subscribeToKeyboardShortcut();

        if (this.props.isFocused && this.props.autoFocus && this.textInput) {
            this.focusTimeout = setTimeout(() => {
                this.textInput.focus();
            }, CONST.ANIMATED_TRANSITION);
        }

        this.scrollToIndex(this.props.selectedOptions.length ? 0 : this.state.focusedIndex, false);
    }

    componentDidUpdate(prevProps, prevState) {
        if (prevProps.isFocused !== this.props.isFocused) {
            if (this.props.isFocused) {
                this.subscribeToKeyboardShortcut();
            } else {
                this.unSubscribeFromKeyboardShortcut();
            }
        }

        // Screen coming back into focus, for example
        // when doing Cmd+Shift+K, then Cmd+K, then Cmd+Shift+K.
        // Only applies to platforms that support keyboard shortcuts
        if ([CONST.PLATFORM.DESKTOP, CONST.PLATFORM.WEB].includes(getPlatform()) && !prevProps.isFocused && this.props.isFocused && this.props.autoFocus && this.textInput) {
            setTimeout(() => {
                this.textInput.focus();
            }, CONST.ANIMATED_TRANSITION);
        }

        if (prevState.paginationPage !== this.state.paginationPage) {
            const newSections = this.sliceSections();

            this.setState({
                sections: newSections,
            });
        }

        if (_.isEqual(this.props.sections, prevProps.sections)) {
            return;
        }

        const newSections = this.sliceSections();
        const newOptions = this.flattenSections();

        if (prevProps.preferredLocale !== this.props.preferredLocale) {
            this.setState({
                sections: newSections,
                allOptions: newOptions,
            });
            return;
        }
        const newFocusedIndex = this.props.selectedOptions.length;
        const isNewFocusedIndex = newFocusedIndex !== this.state.focusedIndex;

        // eslint-disable-next-line react/no-did-update-set-state
        this.setState(
            {
                sections: newSections,
                allOptions: newOptions,
                focusedIndex: _.isNumber(this.props.focusedIndex) ? this.props.focusedIndex : newFocusedIndex,
            },
            () => {
                // If we just toggled an option on a multi-selection page or cleared the search input, scroll to top
                if (this.props.selectedOptions.length !== prevProps.selectedOptions.length || (!!prevState.value && !this.state.value)) {
                    this.scrollToIndex(0);
                    return;
                }

                // Otherwise, scroll to the focused index (as long as it's in range)
                if (this.state.allOptions.length <= this.state.focusedIndex || !isNewFocusedIndex) {
                    return;
                }
                this.scrollToIndex(this.state.focusedIndex);
            },
        );
    }

    componentWillUnmount() {
        if (this.focusTimeout) {
            clearTimeout(this.focusTimeout);
        }

        this.unSubscribeFromKeyboardShortcut();
    }

    /**
     * @param {Array<Object>} allOptions
     * @returns {Number}
     */
    getInitiallyFocusedIndex(allOptions) {
        let defaultIndex;
        if (this.props.shouldTextInputAppearBelowOptions) {
            defaultIndex = allOptions.length;
        } else if (this.props.focusedIndex >= 0) {
            defaultIndex = this.props.focusedIndex;
        } else {
            defaultIndex = this.props.selectedOptions.length;
        }
        if (_.isUndefined(this.props.initiallyFocusedOptionKey)) {
            return defaultIndex;
        }

        const indexOfInitiallyFocusedOption = _.findIndex(allOptions, (option) => option.keyForList === this.props.initiallyFocusedOptionKey);

        if (indexOfInitiallyFocusedOption >= 0) {
            return indexOfInitiallyFocusedOption;
        }

        return defaultIndex;
    }

    /**
     * Maps sections to render only allowed count of them per section.
     *
     * @returns {Objects[]}
     */
    sliceSections() {
        return _.map(this.props.sections, (section) => {
            if (_.isEmpty(section.data)) {
                return section;
            }

            return {
                ...section,
                data: section.data.slice(0, CONST.MAX_OPTIONS_SELECTOR_PAGE_LENGTH * lodashGet(this.state, 'paginationPage', 1)),
            };
        });
    }

    /**
     * Calculates all currently visible options based on the sections that are currently being shown
     * and the number of items of those sections.
     *
     * @returns {Number}
     */
    calculateAllVisibleOptionsCount() {
        let count = 0;

        _.forEach(this.state.sections, (section) => {
            count += lodashGet(section, 'data.length', 0);
        });

        return count;
    }

    updateSearchValue(value) {
        this.setState({
            paginationPage: 1,
            errorMessage: value.length > this.props.maxLength ? this.props.translate('common.error.characterLimitExceedCounter', {length: value.length, limit: this.props.maxLength}) : '',
            value,
        });

        this.props.onChangeText(value);
    }

    handleReferralModal() {
        this.setState((prevState) => ({shouldShowReferralModal: !prevState.shouldShowReferralModal}));
    }

    subscribeToKeyboardShortcut() {
        const enterConfig = CONST.KEYBOARD_SHORTCUTS.ENTER;
        this.unsubscribeEnter = KeyboardShortcut.subscribe(
            enterConfig.shortcutKey,
            this.selectFocusedOption,
            enterConfig.descriptionKey,
            enterConfig.modifiers,
            true,
            () => !this.state.allOptions[this.state.focusedIndex],
        );

        const CTRLEnterConfig = CONST.KEYBOARD_SHORTCUTS.CTRL_ENTER;
        this.unsubscribeCTRLEnter = KeyboardShortcut.subscribe(
            CTRLEnterConfig.shortcutKey,
            () => {
                if (this.props.canSelectMultipleOptions) {
                    this.props.onConfirmSelection();
                    return;
                }

                const focusedOption = this.state.allOptions[this.state.focusedIndex];
                if (!focusedOption) {
                    return;
                }

                this.selectRow(focusedOption);
            },
            CTRLEnterConfig.descriptionKey,
            CTRLEnterConfig.modifiers,
            true,
        );
    }

    unSubscribeFromKeyboardShortcut() {
        if (this.unsubscribeEnter) {
            this.unsubscribeEnter();
        }

        if (this.unsubscribeCTRLEnter) {
            this.unsubscribeCTRLEnter();
        }
    }

    selectFocusedOption(e) {
        const focusedItemKey = lodashGet(e, ['target', 'attributes', 'id', 'value']);
        const focusedOption = focusedItemKey ? _.find(this.state.allOptions, (option) => option.keyForList === focusedItemKey) : this.state.allOptions[this.state.focusedIndex];

        if (!focusedOption || !this.props.isFocused) {
            return;
        }

        if (this.props.canSelectMultipleOptions) {
            this.selectRow(focusedOption);
        } else if (!this.state.shouldDisableRowSelection) {
            this.setState({shouldDisableRowSelection: true});

            let result = this.selectRow(focusedOption);
            if (!(result instanceof Promise)) {
                result = Promise.resolve();
            }

            setTimeout(() => {
                result.finally(() => {
                    this.setState({shouldDisableRowSelection: false});
                });
            }, 500);
        }
    }

    focus() {
        if (!this.textInput) {
            return;
        }

        this.textInput.focus();
    }

    /**
     * Flattens the sections into a single array of options.
     * Each object in this array is enhanced to have:
     *
     *   1. A `sectionIndex`, which represents the index of the section it came from
     *   2. An `index`, which represents the index of the option within the section it came from.
     *
     * @returns {Array<Object>}
     */
    flattenSections() {
        const allOptions = [];
        this.disabledOptionsIndexes = [];
        let index = 0;
        _.each(this.props.sections, (section, sectionIndex) => {
            _.each(section.data, (option, optionIndex) => {
                allOptions.push({
                    ...option,
                    sectionIndex,
                    index: optionIndex,
                });
                if (section.isDisabled || option.isDisabled) {
                    this.disabledOptionsIndexes.push(index);
                }
                index += 1;
            });
        });
        return allOptions;
    }

    /**
     * @param {Number} index
     */
    updateFocusedIndex(index) {
        this.setState({focusedIndex: index}, () => this.scrollToIndex(index));
    }

    /**
     * Scrolls to the focused index within the SectionList
     *
     * @param {Number} index
     * @param {Boolean} animated
     */
    scrollToIndex(index, animated = true) {
        const option = this.state.allOptions[index];
        if (!this.list || !option) {
            return;
        }

        const itemIndex = option.index;
        const sectionIndex = option.sectionIndex;

        if (!lodashGet(this.state.sections, `[${sectionIndex}].data[${itemIndex}]`, null)) {
            return;
        }

        // Note: react-native's SectionList automatically strips out any empty sections.
        // So we need to reduce the sectionIndex to remove any empty sections in front of the one we're trying to scroll to.
        // Otherwise, it will cause an index-out-of-bounds error and crash the app.
        let adjustedSectionIndex = sectionIndex;
        for (let i = 0; i < sectionIndex; i++) {
            if (_.isEmpty(lodashGet(this.state.sections, `[${i}].data`))) {
                adjustedSectionIndex--;
            }
        }

        this.list.scrollToLocation({sectionIndex: adjustedSectionIndex, itemIndex, animated});
    }

    /**
     * Completes the follow-up actions after a row is selected
     *
     * @param {Object} option
     * @param {Object} ref
     * @returns {Promise}
     */
    selectRow(option, ref) {
        return new Promise((resolve) => {
            if (this.props.shouldShowTextInput && this.props.shouldPreventDefaultFocusOnSelectRow) {
                if (this.relatedTarget && ref === this.relatedTarget) {
                    this.textInput.focus();
                    this.relatedTarget = null;
                }
                if (this.textInput.isFocused()) {
                    setSelection(this.textInput, 0, this.state.value.length);
                }
            }
            const selectedOption = this.props.onSelectRow(option);
            resolve(selectedOption);

            if (!this.props.canSelectMultipleOptions) {
                return;
            }

            // Focus the first unselected item from the list (i.e: the best result according to the current search term)
            this.setState({
                focusedIndex: this.props.selectedOptions.length,
            });
        });
    }

    /**
     * Completes the follow-up action after clicking on multiple select button
     * @param {Object} option
     */
    addToSelection(option) {
        if (this.props.shouldShowTextInput && this.props.shouldPreventDefaultFocusOnSelectRow) {
            this.textInput.focus();
            if (this.textInput.isFocused()) {
                setSelection(this.textInput, 0, this.state.value.length);
            }
        }
        this.props.onAddToSelection(option);
    }

    /**
     * Increments a pagination page to show more items
     */
    incrementPage() {
        this.setState((prev) => ({
            paginationPage: prev.paginationPage + 1,
        }));
    }

    render() {
        const shouldShowShowMoreButton = this.state.allOptions.length > CONST.MAX_OPTIONS_SELECTOR_PAGE_LENGTH * this.state.paginationPage;
        const shouldShowFooter =
            !this.props.isReadOnly && (this.props.shouldShowConfirmButton || this.props.footerContent) && !(this.props.canSelectMultipleOptions && _.isEmpty(this.props.selectedOptions));
        const defaultConfirmButtonText = _.isUndefined(this.props.confirmButtonText) ? this.props.translate('common.confirm') : this.props.confirmButtonText;
        const shouldShowDefaultConfirmButton = !this.props.footerContent && defaultConfirmButtonText;
        const safeAreaPaddingBottomStyle = shouldShowFooter ? undefined : this.props.safeAreaPaddingBottomStyle;
        const listContainerStyles = this.props.listContainerStyles || [this.props.themeStyles.flex1];
        const optionHoveredStyle = this.props.optionHoveredStyle || this.props.themeStyles.hoveredComponentBG;

        const textInput = (
            <TextInput
                ref={(el) => (this.textInput = el)}
                label={this.props.textInputLabel}
                accessibilityLabel={this.props.textInputLabel}
                role={CONST.ROLE.PRESENTATION}
                onChangeText={this.debouncedUpdateSearchValue}
                errorText={this.state.errorMessage}
                onSubmitEditing={this.selectFocusedOption}
                placeholder={this.props.placeholderText}
                maxLength={this.props.maxLength + CONST.ADDITIONAL_ALLOWED_CHARACTERS}
                keyboardType={this.props.keyboardType}
                onBlur={(e) => {
                    if (!this.props.shouldPreventDefaultFocusOnSelectRow) {
                        return;
                    }
                    this.relatedTarget = e.relatedTarget;
                }}
                selectTextOnFocus
                blurOnSubmit={Boolean(this.state.allOptions.length)}
                spellCheck={false}
                shouldInterceptSwipe={this.props.shouldTextInputInterceptSwipe}
                isLoading={this.props.isLoadingNewOptions}
                testID="options-selector-input"
            />
        );
        const optionsList = (
            <OptionsList
                ref={(el) => (this.list = el)}
                optionHoveredStyle={optionHoveredStyle}
                onSelectRow={this.props.onSelectRow ? this.selectRow : undefined}
                sections={this.state.sections}
                focusedIndex={this.state.focusedIndex}
                selectedOptions={this.props.selectedOptions}
                canSelectMultipleOptions={this.props.canSelectMultipleOptions}
                shouldShowMultipleOptionSelectorAsButton={this.props.shouldShowMultipleOptionSelectorAsButton}
                multipleOptionSelectorButtonText={this.props.multipleOptionSelectorButtonText}
                onAddToSelection={this.addToSelection}
                hideSectionHeaders={this.props.hideSectionHeaders}
                headerMessage={this.state.errorMessage ? '' : this.props.headerMessage}
                boldStyle={this.props.boldStyle}
                showTitleTooltip={this.props.showTitleTooltip}
                isDisabled={this.props.isDisabled}
                shouldHaveOptionSeparator={this.props.shouldHaveOptionSeparator}
                highlightSelectedOptions={this.props.highlightSelectedOptions}
                onLayout={() => {
                    if (this.props.selectedOptions.length === 0) {
                        this.scrollToIndex(this.state.focusedIndex, false);
                    }

                    if (this.props.onLayout) {
                        this.props.onLayout();
                    }
                }}
                contentContainerStyles={[safeAreaPaddingBottomStyle, ...this.props.contentContainerStyles]}
                sectionHeaderStyle={this.props.sectionHeaderStyle}
                listContainerStyles={listContainerStyles}
                listStyles={this.props.listStyles}
                isLoading={!this.props.shouldShowOptions}
                showScrollIndicator={this.props.showScrollIndicator}
                isRowMultilineSupported={this.props.isRowMultilineSupported}
                isLoadingNewOptions={this.props.isLoadingNewOptions}
                shouldPreventDefaultFocusOnSelectRow={this.props.shouldPreventDefaultFocusOnSelectRow}
                nestedScrollEnabled={this.props.nestedScrollEnabled}
                bounces={!this.props.shouldTextInputAppearBelowOptions || !this.props.shouldAllowScrollingChildren}
                renderFooterContent={() =>
                    shouldShowShowMoreButton && (
                        <ShowMoreButton
                            containerStyle={{...this.props.themeStyles.mt2, ...this.props.themeStyles.mb5}}
                            currentCount={CONST.MAX_OPTIONS_SELECTOR_PAGE_LENGTH * this.state.paginationPage}
                            totalCount={this.state.allOptions.length}
                            onPress={this.incrementPage}
                        />
                    )
                }
            />
        );

        const optionsAndInputsBelowThem = (
            <>
                <View
                    style={[
                        this.props.themeStyles.flexGrow0,
                        this.props.themeStyles.flexShrink1,
                        this.props.themeStyles.flexBasisAuto,
                        this.props.themeStyles.w100,
                        this.props.themeStyles.flexRow,
                    ]}
                >
                    {optionsList}
                </View>
                <View
                    style={
                        this.props.shouldUseStyleForChildren
                            ? [this.props.themeStyles.ph5, this.props.themeStyles.pv5, this.props.themeStyles.flexGrow1, this.props.themeStyles.flexShrink0]
                            : []
                    }
                >
                    {this.props.children}
                    {this.props.shouldShowTextInput && textInput}
                </View>
            </>
        );

        return (
            <ArrowKeyFocusManager
                disabledIndexes={this.disabledOptionsIndexes}
                focusedIndex={this.state.focusedIndex}
                maxIndex={this.calculateAllVisibleOptionsCount() - 1}
                onFocusedIndexChanged={this.props.disableArrowKeysActions ? () => {} : this.updateFocusedIndex}
                shouldResetIndexOnEndReached={false}
            >
                <View style={[this.props.themeStyles.flexGrow1, this.props.themeStyles.flexShrink1, this.props.themeStyles.flexBasisAuto]}>
                    {/*
                     * The OptionsList component uses a SectionList which uses a VirtualizedList internally.
                     * VirtualizedList cannot be directly nested within ScrollViews of the same orientation.
                     * To work around this, we wrap the OptionsList component with a horizontal ScrollView.
                     */}
                    {this.props.shouldTextInputAppearBelowOptions && this.props.shouldAllowScrollingChildren && (
                        <ScrollView contentContainerStyle={[this.props.themeStyles.flexGrow1]}>
                            <ScrollView
                                horizontal
                                bounces={false}
                                contentContainerStyle={[this.props.themeStyles.flex1, this.props.themeStyles.flexColumn]}
                            >
                                {optionsAndInputsBelowThem}
                            </ScrollView>
                        </ScrollView>
                    )}

                    {this.props.shouldTextInputAppearBelowOptions && !this.props.shouldAllowScrollingChildren && optionsAndInputsBelowThem}

                    {!this.props.shouldTextInputAppearBelowOptions && (
                        <>
                            <View style={this.props.shouldUseStyleForChildren ? [this.props.themeStyles.ph5, this.props.themeStyles.pb3] : []}>
                                {this.props.children}
                                {this.props.shouldShowTextInput && textInput}
                                {Boolean(this.props.textInputAlert) && (
                                    <FormHelpMessage
                                        message={this.props.textInputAlert}
                                        style={[this.props.themeStyles.mb3]}
                                        isError={false}
                                    />
                                )}
                            </View>
                            {optionsList}
                        </>
                    )}
                </View>
                {this.props.shouldShowReferralCTA && (
                    <View style={[this.props.themeStyles.ph5, this.props.themeStyles.pb5, this.props.themeStyles.flexShrink0]}>
                        <PressableWithoutFeedback
                            onPress={() => {
                                Navigation.navigate(ROUTES.REFERRAL_DETAILS_MODAL.getRoute(this.props.referralContentType));
                            }}
                            style={[
                                this.props.themeStyles.p5,
                                this.props.themeStyles.w100,
                                this.props.themeStyles.br2,
                                this.props.themeStyles.highlightBG,
                                this.props.themeStyles.flexRow,
                                this.props.themeStyles.justifyContentBetween,
                                this.props.themeStyles.alignItemsCenter,
                                {gap: 10},
                            ]}
                            accessibilityLabel="referral"
                            role={CONST.ACCESSIBILITY_ROLE.BUTTON}
                        >
                            <Text>
                                {this.props.translate(`referralProgram.${this.props.referralContentType}.buttonText1`)}
                                <Text
                                    color={this.props.theme.success}
                                    style={this.props.themeStyles.textStrong}
                                >
                                    {this.props.translate(`referralProgram.${this.props.referralContentType}.buttonText2`)}
                                </Text>
                            </Text>
                            <Icon
                                src={Info}
                                height={20}
                                width={20}
                                fill={this.props.theme.icon}
                            />
                        </PressableWithoutFeedback>
                    </View>
                )}

                {shouldShowFooter && (
                    <FixedFooter>
                        {shouldShowDefaultConfirmButton && (
                            <Button
                                success
                                style={[this.props.themeStyles.w100]}
                                text={defaultConfirmButtonText}
                                onPress={this.props.onConfirmSelection}
                                pressOnEnter
                                enterKeyEventListenerPriority={1}
                            />
                        )}
                        {this.props.footerContent}
                    </FixedFooter>
                )}
            </ArrowKeyFocusManager>
        );
    }
}

BaseOptionsSelector.defaultProps = defaultProps;
BaseOptionsSelector.propTypes = propTypes;

export default compose(withLocalize, withNavigationFocus, withThemeStyles, withTheme)(BaseOptionsSelector);
