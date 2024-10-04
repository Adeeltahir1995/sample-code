import { ButtonMode } from './button-mode.enum';
import { ButtonProps } from './button-prop.interface';
import { ButtonSize } from './button-size.enum';
import { ButtonState } from './button-state.enum';
import { ButtonTypeClasses } from './button-type-classes.interface';
import { ButtonType } from './button-type.enum';
import classNames from 'classnames';
import React, { useCallback, useState } from 'react';

/**
 * Button Component
 *
 * A customizable button component supporting various types, sizes, states, and modes.
 * It can display icons before or after the label, or as an icon-only button.
 */
const Button: React.FC<ButtonProps> = ({
  label,
  icon,
  onClick,
  state = ButtonState.Enabled,
  type = ButtonType.Filled,
  size = ButtonSize.Big,
  mode = ButtonMode.OnLight,
  iconOnly = false,
  iconBefore,
  iconAfter,
  className,
}) => {
  // State variables to manage hover, press, and animation states
  const [interactionState, setInteractionState] = useState({
    isHovered: false,
    isPressed: false,
    isEntering: false,
    isLeaving: false,
  });

  /**
   * Determines the current button state based on interaction states.
   * Priority: Pressed > Hovered > Default State
   */
  const buttonState = interactionState.isPressed
    ? ButtonState.Pressed
    : interactionState.isHovered && state === ButtonState.Enabled
      ? ButtonState.Hovered
      : state;

  /**
   * Retrieves the base CSS classes for the button.
   * These are common classes applied regardless of type, size, or state.
   */
  const getBaseClasses = () => {
    return ['rounded-xl', 'justify-center', 'items-center', 'inline-flex'];
  };

  /**
   * Retrieves the CSS classes based on the button size.
   * Adjusts height and padding according to the specified size.
   */
  const getSizeClasses = () => {
    return size === ButtonSize.Medium ? ['h-9', 'px-3', 'py-2.5'] : ['h-11', 'px-4', 'py-3.5'];
  };

  /**
   * Retrieves the CSS classes based on the button type and state.
   * Handles different styles for Filled, Outlined, and Link types.
   */
  const getTypeClasses = () => {
    const commonClasses = {
      [ButtonType.Filled]: [],
      [ButtonType.Outlined]: ['bg-transparent', 'border-1'],
      [ButtonType.Link]: ['bg-transparent', 'underline', 'text-link-l1', 'py-4', 'h-4'],
    };

    const commonModeClasses = {
      [ButtonType.Filled]: {
        [ButtonMode.OnLight]: {
          [ButtonState.Enabled]: ['text-content-neutral-inverse-enabled'],
          [ButtonState.Disabled]: ['text-content-neutral-inverse-disabled'],
        },
        [ButtonMode.OnDark]: {
          [ButtonState.Enabled]: ['text-content-neutral-default-enabled'],
          [ButtonState.Disabled]: ['text-content-neutral-default-disabled'],
        },
      },
    };

    const typeClasses: ButtonTypeClasses = {
      [ButtonType.Filled]: {
        [ButtonMode.OnLight]: {
          [ButtonState.Enabled]: ['bg-neutral-inverse-enabled'],
          [ButtonState.Hovered]: ['bg-neutral-inverse-hovered', 'shadow-button-inverse'],
          [ButtonState.Pressed]: ['bg-neutral-inverse-pressed', 'shadow-button-inverse'],
          [ButtonState.Disabled]: ['bg-neutral-inverse-disabled'],
        },
        [ButtonMode.OnDark]: {
          [ButtonState.Enabled]: ['bg-neutral-default-enabled'],
          [ButtonState.Hovered]: ['bg-neutral-default-hovered', 'shadow-button-default'],
          [ButtonState.Pressed]: ['bg-neutral-default-pressed', 'shadow-button-default'],
          [ButtonState.Disabled]: ['bg-neutral-default-disabled'],
        },
      },
      [ButtonType.Outlined]: {
        [ButtonState.Enabled]: ['border-neutral-subtler-enabled', 'text-content-neutral-default-enabled'],
        [ButtonState.Hovered]: ['border-neutral-subtler-hovered', 'shadow-button-default'],
        [ButtonState.Pressed]: ['border-neutral-subtler-pressed', 'bg-neutral-default-pressed'],
        [ButtonState.Disabled]: ['border-neutral-subtler-disabled', 'text-content-neutral-default-disabled'],
      },
      [ButtonType.Link]: {
        enabled: ['text-content-neutral-default-enabled'],
        hovered: ['text-content-neutral-default-hovered'],
        pressed: ['text-content-neutral-default-pressed'],
        disabled: ['text-content-neutral-default-disabled'],
      },
    };

    // If the button is icon-only, apply specific classes
    if (iconOnly) {
      return [
        'bg-neutral-subtle-enabled',
        interactionState.isHovered && 'bg-neutral-subtle-hovered shadow-button-default',
        interactionState.isPressed && 'bg-neutral-subtle-pressed shadow-button-default',
        buttonState === ButtonState.Disabled && 'bg-neutral-subtle-disabled text-content-neutral-default-disabled',
      ];
    }

    // Apply classes based on button type
    if (type === ButtonType.Filled) {
      const modeClasses = commonModeClasses.filled[mode];
      const stateClasses = typeClasses[type][mode][buttonState];
      const textColorClass =
        buttonState === ButtonState.Disabled ? modeClasses.disabled : modeClasses[ButtonState.Enabled];
      return [...commonClasses[type], ...stateClasses, ...textColorClass];
    } else {
      return [...commonClasses[type], ...typeClasses[type][buttonState]];
    }
  };

  /**
   * Retrieves the CSS classes for button animations based on the mode and state.
   * Handles entering and leaving animations for different button types and modes.
   */
  const getAnimationClasses = useCallback(() => {
    const { isEntering, isLeaving } = interactionState;
    if (mode === ButtonMode.OnLight && buttonState !== ButtonState.Disabled && type !== ButtonType.Link && !iconOnly) {
      if (isLeaving) {
        return ['animate-button-inverse-leave-dissolve'];
      }
      if (isEntering) {
        return ['animate-button-inverse-enter-dissolve'];
      }
    }
    if ((mode === ButtonMode.OnDark && buttonState !== ButtonState.Disabled && type !== ButtonType.Link) || iconOnly) {
      if (isLeaving) {
        return ['animate-button-default-leave-dissolve'];
      }
      if (isEntering) {
        return ['animate-button-default-enter-dissolve'];
      }
    }
    if (type === ButtonType.Link) {
      if (isLeaving) {
        return ['animate-button-link-inverse-leave-dissolve'];
      }
      if (isEntering) {
        return ['animate-button-link-inverse-enter-dissolve'];
      }
    }
    return [];
  }, [interactionState, buttonState, iconOnly, mode, type]);

  /**
   * Handles mouse enter events.
   * Sets the hovered and entering states to trigger hover styles and animations.
   */
  const handleMouseEnter = useCallback(() => {
    if (!interactionState.isHovered && !interactionState.isEntering) {
      setInteractionState((prevState) => ({
        ...prevState,
        isHovered: true,
        isEntering: true,
        isLeaving: false,
      }));
    }
  }, [interactionState]);

  /**
   * Handles mouse leave events.
   * Resets the hovered and pressed states, and triggers leaving animations.
   */
  const handleMouseLeave = useCallback(() => {
    if (interactionState.isHovered && !interactionState.isLeaving) {
      setInteractionState((prevState) => ({
        ...prevState,
        isHovered: false,
        isPressed: false,
        isEntering: false,
        isLeaving: true,
      }));
    }
  }, [interactionState]);

  /**
   * Handles the end of CSS animations.
   * Resets entering and leaving states after animations complete.
   */
  const handleAnimationEnd = useCallback(() => {
    setInteractionState((prevState) => ({
      ...prevState,
      isLeaving: false,
      isEntering: false,
    }));
  }, []);

  /**
   * Handles mouse down events.
   * Sets the pressed state to true when the mouse button is pressed.
   */
  const handleMouseDown = useCallback(() => {
    setInteractionState((prevState) => ({
      ...prevState,
      isPressed: true,
    }));
  }, []);

  /**
   * Handles mouse up events.
   * Resets the pressed state to false when the mouse button is released.
   */

  const handleMouseUp = useCallback(() => {
    setInteractionState((prevState) => ({
      ...prevState,
      isPressed: false,
    }));
  }, []);

  /**
   * Combines all relevant CSS classes for the button using the `classnames` library.
   * Includes base, size, type, animation classes, and any additional custom classes.
   */
  const buttonClasses = classNames(
    ...getBaseClasses(),
    ...getSizeClasses(),
    ...getTypeClasses(),
    ...getAnimationClasses(),
    { 'justify-center': iconOnly },
    className
  );

  return (
    <button
      className={buttonClasses}
      onClick={onClick}
      disabled={state === ButtonState.Disabled}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onAnimationEnd={handleAnimationEnd}
    >
      {iconOnly && icon ? (
        <span>{icon}</span>
      ) : (
        <>
          {iconBefore && <span className="icon-before pr-2">{iconBefore}</span>}
          {label && (
            <span className="font-dmSans text-body-p2-medium font-medium leading-none">
              {typeof label === 'string' ? label : label}
            </span>
          )}

          {iconAfter && <span className="icon-after pl-2">{iconAfter}</span>}
        </>
      )}
    </button>
  );
};

export default Button;
