import type {AutocompleteVariantProps, SlotsToClasses, AutocompleteSlots} from "@nextui-org/theme";
import type {DOMAttributes, HTMLNextUIProps, PropGetter} from "@nextui-org/system";

import {mapPropsVariants, useProviderContext, SharedSelection} from "@nextui-org/system";
import {useSafeLayoutEffect} from "@nextui-org/use-safe-layout-effect";
import {autocomplete} from "@nextui-org/theme";
import {useFilter} from "@react-aria/i18n";
import {ComboBoxState, FilterFn, useComboBoxState} from "@react-stately/combobox";
import {ReactRef, useDOMRef} from "@nextui-org/react-utils";
import {ReactNode, useCallback, useEffect, useMemo, useRef} from "react";
import {ComboBoxProps} from "@react-types/combobox";
import {PopoverProps} from "@nextui-org/popover";
import {ListboxProps} from "@nextui-org/listbox";
import {InputProps} from "@nextui-org/input";
import {clsx, dataAttr, objectToDeps} from "@nextui-org/shared-utils";
import {ScrollShadowProps} from "@nextui-org/scroll-shadow";
import {chain, mergeProps} from "@react-aria/utils";
import {ButtonProps} from "@nextui-org/button";
import {AsyncLoadable, PressEvent} from "@react-types/shared";
import {useComboBox} from "@react-aria/combobox";
import {ariaShouldCloseOnInteractOutside} from "@nextui-org/aria-utils";

interface Props<T> extends Omit<HTMLNextUIProps<"input">, keyof ComboBoxProps<T>> {
  /**
   * Ref to the DOM node.
   */
  ref?: ReactRef<HTMLElement | null>;
  /**
   * The ref to the scroll element. Useful when having async loading of items.
   */
  scrollRef?: ReactRef<HTMLElement | null>;
  /**
   * The icon that represents the autocomplete open state. Usually a chevron icon.
   */
  selectorIcon?: ReactNode;
  /**
   * The icon that represents the clear button. Usually a cross icon.
   */
  clearIcon?: ReactNode;
  /**
   * Whether to display a top and bottom arrow indicators when the listbox is scrollable.
   * @default true
   */
  showScrollIndicators?: boolean;
  /**
   * Props to be passed to the scroll shadow component. This component
   * adds a shadow to the top and bottom of the listbox when it is scrollable.
   *
   * @default { hideScrollBar: true, offset: 15 }
   */
  scrollShadowProps?: Partial<ScrollShadowProps>;
  /**
   * Props to be passed to the popover component.
   *
   * @default { placement: "bottom", triggerScaleOnOpen: false, offset: 5 }
   */
  popoverProps?: Partial<PopoverProps>;
  /**
   * Props to be passed to the listbox component.
   *
   * @default { disableAnimation: false }
   */
  listboxProps?: Partial<ListboxProps>;
  /**
   * Props to be passed to the input component.
   *
   * @default { disableAnimation: false }
   */
  inputProps?: Partial<InputProps>;
  /**
   * Whether the clear button should be hidden.
   * @default false
   * @deprecated Use `isClearable` instead.
   */
  disableClearable?: boolean;
  /**
   * Props to be passed to the selector button component.
   * @default { size: "sm", variant: "light", radius: "full", isIconOnly: true }
   */
  selectorButtonProps?: Partial<ButtonProps>;
  /**
   * Props to be passed to the clear button component.
   * @default { size: "sm", variant: "light", radius: "full", isIconOnly: true }
   */
  clearButtonProps?: Partial<ButtonProps>;
  /**
   * The filter options to use when filtering items based on user input.
   * @default {sensitivity: 'base'}
   */
  filterOptions?: Intl.CollatorOptions;
  /**
   * Whether the autocomplete allows the menu to be open when the collection is empty.
   * @default true
   */
  allowsEmptyCollection?: boolean;
  /**
   * Whether the autocomplete menu should close on blur.
   * @default true
   * */
  shouldCloseOnBlur?: boolean;
  /**
   * Classes object to style the autocomplete and its children.
   */
  classNames?: SlotsToClasses<AutocompleteSlots>;
  /**
   * The filter function used to determine if a option should be included in the autocomplete list.
   * */
  defaultFilter?: FilterFn;
  /**
   * Callback fired when the select menu is closed.
   */
  onClose?: () => void;
  /**
   * Handler that is called when the selection changes.
   */
  onSelectionChange?: (keys: SharedSelection) => void;
}
interface InputData {
  isDisabled?: boolean;
  isRequired?: boolean;
  name?: string;
  validationBehavior?: "aria" | "native";
}

export const inputData = new WeakMap<ComboBoxState<any>, InputData>();

export type UseAutocompleteProps<T> = Props<T> &
  Omit<
    InputProps,
    "children" | "value" | "isClearable" | "defaultValue" | "classNames" | "onSelectionChange"
  > &
  ComboBoxProps<T> &
  AsyncLoadable &
  AutocompleteVariantProps;

export function useAutocomplete<T extends object>(originalProps: UseAutocompleteProps<T>) {
  const globalContext = useProviderContext();

  const [props, variantProps] = mapPropsVariants(originalProps, autocomplete.variantKeys);
  const disableAnimation =
    originalProps.disableAnimation ?? globalContext?.disableAnimation ?? false;

  // TODO: Remove disableClearable prop in the next minor release.
  const isClearable =
    originalProps.disableClearable !== undefined
      ? !originalProps.disableClearable
      : originalProps.isReadOnly
      ? false
      : originalProps.isClearable;

  const {
    ref,
    as,
    label,
    isLoading,
    menuTrigger = "focus",
    filterOptions = {
      sensitivity: "base",
    },
    children,
    selectorIcon,
    clearIcon,
    scrollRef: scrollRefProp,
    defaultFilter,
    endContent,
    allowsEmptyCollection = true,
    shouldCloseOnBlur = true,
    popoverProps = {},
    inputProps: userInputProps = {},
    scrollShadowProps = {},
    listboxProps = {},
    selectorButtonProps = {},
    clearButtonProps = {},
    showScrollIndicators = true,
    allowsCustomValue = false,
    validationBehavior = globalContext?.validationBehavior ?? "aria",
    className,
    classNames,
    errorMessage,
    onOpenChange,
    onChange,
    onClose,
    onSelectionChange,
    isReadOnly = false,
    ...otherProps
  } = props;

  // Setup filter function and state.
  const {contains} = useFilter(filterOptions);

  let state = useComboBoxState({
    ...originalProps,
    children,
    menuTrigger,
    validationBehavior,
    shouldCloseOnBlur,
    allowsEmptyCollection,
    defaultFilter: defaultFilter && typeof defaultFilter === "function" ? defaultFilter : contains,
    onOpenChange: (open, menuTrigger) => {
      onOpenChange?.(open, menuTrigger);
      if (!open) {
        onClose?.();
      }
    },
    onSelectionChange: (keys) => {
      onSelectionChange?.(keys);
      if (onChange && typeof onChange === "function") {
        onChange({
          target: {
            name: inputRef?.current?.name,
            value: keys,
          },
        } as React.ChangeEvent<HTMLInputElement>);
      }
    },
  });

  state = {
    ...state,
    ...(isReadOnly && {
      disabledKeys: new Set([...state.collection.getKeys()]),
    }),
  };

  // Setup refs and get props for child elements.
  const buttonRef = useRef<HTMLButtonElement>(null);
  const inputWrapperRef = useRef<HTMLDivElement>(null);
  const listBoxRef = useRef<HTMLUListElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const inputRef = useDOMRef<HTMLInputElement>(ref);
  const scrollShadowRef = useDOMRef<HTMLElement>(scrollRefProp);

  const {
    buttonProps,
    inputProps,
    listBoxProps,
    isInvalid: isAriaInvalid,
    validationDetails,
    validationErrors,
  } = useComboBox(
    {
      validationBehavior,
      ...originalProps,
      inputRef,
      buttonRef,
      listBoxRef,
      popoverRef,
    },
    state,
  );

  const isInvalid = originalProps.isInvalid || isAriaInvalid;

  const slotsProps: {
    inputProps: InputProps;
    popoverProps: UseAutocompleteProps<T>["popoverProps"];
    scrollShadowProps: UseAutocompleteProps<T>["scrollShadowProps"];
    listboxProps: UseAutocompleteProps<T>["listboxProps"];
    selectorButtonProps: UseAutocompleteProps<T>["selectorButtonProps"];
    clearButtonProps: UseAutocompleteProps<T>["clearButtonProps"];
  } = {
    inputProps: mergeProps(
      {
        label,
        // ref: inputRef,
        wrapperRef: inputWrapperRef,
        onClick: () => {
          if (!state.isOpen && !!state.selectedItem) {
            state.open();
          }
        },
        isClearable: false,
        disableAnimation,
      },
      userInputProps,
    ),
    popoverProps: mergeProps(
      {
        offset: 5,
        placement: "bottom",
        triggerScaleOnOpen: false,
        disableAnimation,
      },
      popoverProps,
    ),
    scrollShadowProps: mergeProps(
      {
        ref: scrollShadowRef,
        isEnabled: (showScrollIndicators && state.collection.size > 5) ?? true,
        hideScrollBar: true,
        offset: 15,
      },
      scrollShadowProps,
    ),
    listboxProps: mergeProps(
      {
        hideEmptyContent: allowsCustomValue,
        emptyContent: "No results found.",
        disableAnimation,
      },
      listboxProps,
    ),
    selectorButtonProps: mergeProps(
      {
        isLoading,
        size: "sm",
        variant: "light",
        radius: "full",
        color: isInvalid ? "danger" : originalProps?.color,
        isIconOnly: true,
        disableAnimation,
      },
      selectorButtonProps,
    ),
    clearButtonProps: mergeProps(
      {
        size: "sm",
        variant: "light",
        radius: "full",
        color: isInvalid ? "danger" : originalProps?.color,
        isIconOnly: true,
        disableAnimation,
      },
      clearButtonProps,
    ),
  };

  const baseStyles = clsx(classNames?.base, className);
  const isOpen = slotsProps.listboxProps?.hideEmptyContent
    ? state.isOpen && !!state.collection.size
    : state.isOpen;

  // if we use `react-hook-form`, it will set the native input value using the ref in register
  // i.e. setting ref.current.value to something which is uncontrolled
  // hence, sync the state with `ref.current.value`
  useSafeLayoutEffect(() => {
    if (!inputRef.current) return;

    const key = inputRef.current.value;
    const item = state.collection.getItem(key);

    if (item && state.inputValue !== item.textValue) {
      state.setSelectedKey(key);
      state.setInputValue(item.textValue);
    }
  }, [inputRef.current]);

  // focus first non-disabled item
  useEffect(() => {
    let key = state.collection.getFirstKey();

    while (key && state.disabledKeys.has(key)) {
      key = state.collection.getKeyAfter(key);
    }
    state.selectionManager.setFocusedKey(key);
  }, [state.collection, state.disabledKeys]);

  useEffect(() => {
    if (isOpen) {
      // apply the same with to the popover as the select
      if (popoverRef.current && inputWrapperRef.current) {
        let rect = inputWrapperRef.current.getBoundingClientRect();

        let popover = popoverRef.current;

        popover.style.width = rect.width + "px";
      }
    }
  }, [isOpen]);

  // to prevent the error message:
  // stopPropagation is now the default behavior for events in React Spectrum.
  // You can use continuePropagation() to revert this behavior.
  if (inputProps.onKeyDown) {
    const originalOnKeyDown = inputProps.onKeyDown;

    inputProps.onKeyDown = (e) => {
      if ("continuePropagation" in e) {
        e.stopPropagation = () => {};
      }

      return originalOnKeyDown(e);
    };
  }

  const Component = as || "div";

  const slots = useMemo(
    () =>
      autocomplete({
        ...variantProps,
        isClearable,
        disableAnimation,
        className,
      }),
    [objectToDeps(variantProps), isClearable, disableAnimation, className],
  );

  const getBaseProps: PropGetter = () => ({
    "data-invalid": dataAttr(isInvalid),
    "data-open": dataAttr(state.isOpen),
    className: slots.base({class: baseStyles}),
  });

  const getSelectorButtonProps = () =>
    ({
      ref: buttonRef,
      ...mergeProps(buttonProps, slotsProps.selectorButtonProps),
      "data-open": dataAttr(state.isOpen),
      className: slots.selectorButton({
        class: clsx(classNames?.selectorButton, slotsProps.selectorButtonProps?.className),
      }),
    } as ButtonProps);

  const getClearButtonProps = () =>
    ({
      ...mergeProps(buttonProps, slotsProps.clearButtonProps),
      // disable original focus and state toggle from react aria
      onPressStart: () => {
        // this is in PressStart for mobile so that touching the clear button doesn't remove focus from
        // the input and close the keyboard
        inputRef.current?.focus();
      },
      onPress: (e: PressEvent) => {
        slotsProps.clearButtonProps?.onPress?.(e);
        if (state.selectedItem) {
          state.setInputValue("");
          state.setSelectedKey(null);
        } else {
          if (allowsCustomValue) {
            state.setInputValue("");
          }
        }
        state.open();
      },
      "data-visible": !!state.selectedItem || state.inputValue?.length > 0,
      className: slots.clearButton({
        class: clsx(classNames?.clearButton, slotsProps.clearButtonProps?.className),
      }),
    } as ButtonProps);

  const getInputProps = () => {
    const props = mergeProps(otherProps, inputProps, slotsProps.inputProps);

    // `name` will be in the hidden input
    // so that users can get the value of the input instead of label in form
    delete props["name"];

    return {
      ...props,
      isInvalid,
      validationBehavior,
      errorMessage:
        typeof errorMessage === "function"
          ? errorMessage({isInvalid, validationErrors, validationDetails})
          : errorMessage || validationErrors?.join(" "),
      onClick: chain(slotsProps.inputProps.onClick, otherProps.onClick),
    } as InputProps;
  };

  const getListBoxProps = () =>
    ({
      state,
      ref: listBoxRef,
      ...mergeProps(slotsProps.listboxProps, listBoxProps, {
        shouldHighlightOnFocus: true,
      }),
    } as ListboxProps);

  const getPopoverProps = (props: DOMAttributes = {}) => {
    const popoverProps = mergeProps(slotsProps.popoverProps, props);

    return {
      state,
      ref: popoverRef,
      triggerRef: inputWrapperRef,
      scrollRef: listBoxRef,
      triggerType: "listbox",
      ...popoverProps,
      classNames: {
        content: slots.popoverContent({
          class: clsx(
            classNames?.popoverContent,
            slotsProps.popoverProps?.classNames?.["content"],
            props.className,
          ),
        }),
      },
      shouldCloseOnInteractOutside: popoverProps?.shouldCloseOnInteractOutside
        ? popoverProps.shouldCloseOnInteractOutside
        : (element: Element) => ariaShouldCloseOnInteractOutside(element, inputWrapperRef, state),
      // when the popover is open, the focus should be on input instead of dialog
      // therefore, we skip dialog focus here
      disableDialogFocus: true,
    } as unknown as PopoverProps;
  };

  const getEmptyPopoverProps = () => {
    // avoid null node in `ariaHideOutside` from `@react-aria/overlays`
    return {
      ref: popoverRef,
      className: "hidden",
    };
  };

  const getListBoxWrapperProps: PropGetter = (props: any = {}) => ({
    ...mergeProps(slotsProps.scrollShadowProps, props),
    className: slots.listboxWrapper({
      class: clsx(
        classNames?.listboxWrapper,
        slotsProps.scrollShadowProps?.className,
        props?.className,
      ),
    }),
  });

  const getEndContentWrapperProps: PropGetter = (props: any = {}) => ({
    className: slots.endContentWrapper({
      class: clsx(classNames?.endContentWrapper, props?.className),
    }),
    onPointerDown: chain(props.onPointerDown, (e: React.PointerEvent) => {
      if (e.button === 0 && e.currentTarget === e.target) {
        inputRef.current?.focus();
      }
    }),
    onMouseDown: chain(props.onMouseDown, (e: React.MouseEvent) => {
      if (e.button === 0 && e.currentTarget === e.target) {
        // Chrome and Firefox on touch Windows devices require mouse down events
        // to be canceled in addition to pointer events, or an extra asynchronous
        // focus event will be fired.
        e.preventDefault();
      }
    }),
  });

  const getHiddenInputProps = useCallback(
    (props = {}) => ({
      state,
      inputRef,
      name: originalProps?.name,
      isRequired: originalProps?.isRequired,
      autoComplete: originalProps?.autoComplete,
      isDisabled: originalProps?.isDisabled,
      onChange,
      ...props,
    }),
    [
      state,
      originalProps?.name,
      originalProps?.autoComplete,
      originalProps?.autoComplete,
      originalProps?.isDisabled,
      originalProps?.isRequired,
      inputRef,
    ],
  );

  // store the data to be used in useHiddenInput
  inputData.set(state, {
    isDisabled: originalProps?.isDisabled,
    isRequired: originalProps?.isRequired,
    name: originalProps?.name,
    // TODO: Future enhancement to support "aria" validation behavior.
    validationBehavior: "native",
  });

  return {
    Component,
    inputRef,
    label,
    state,
    slots,
    classNames,
    isLoading,
    clearIcon,
    isOpen,
    endContent,
    isClearable,
    disableAnimation,
    allowsCustomValue,
    selectorIcon,
    getBaseProps,
    getInputProps,
    getListBoxProps,
    getPopoverProps,
    getEmptyPopoverProps,
    getClearButtonProps,
    getSelectorButtonProps,
    getListBoxWrapperProps,
    getEndContentWrapperProps,
    getHiddenInputProps,
  };
}

export type UseAutocompleteReturn = ReturnType<typeof useAutocomplete>;
