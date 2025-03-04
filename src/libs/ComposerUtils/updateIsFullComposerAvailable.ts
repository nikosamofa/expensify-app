import {ComposerProps} from '@components/Composer/types';
import CONST from '@src/CONST';

/**
 * Update isFullComposerAvailable if needed
 * @param numberOfLines The number of lines in the text input
 */
function updateIsFullComposerAvailable(props: ComposerProps, numberOfLines: number) {
    const isFullComposerAvailable = numberOfLines >= CONST.COMPOSER.FULL_COMPOSER_MIN_LINES;
    if (isFullComposerAvailable !== props.isFullComposerAvailable) {
        props.setIsFullComposerAvailable?.(isFullComposerAvailable);
    }
}

export default updateIsFullComposerAvailable;
