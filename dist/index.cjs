'use strict';

var jsxRuntime = require('react/jsx-runtime');
var core = require('@mantine/core');
var clsx = require('clsx');
var react = require('react');
var matchSorterUtils = require('@tanstack/match-sorter-utils');
var reactTable = require('@tanstack/react-table');
var reactVirtual = require('@tanstack/react-virtual');
var hooks = require('@mantine/hooks');
var dates = require('@mantine/dates');
var iconsReact = require('@tabler/icons-react');

const fuzzy$1 = (rowA, rowB, columnId) => {
    let dir = 0;
    if (rowA.columnFiltersMeta[columnId]) {
        dir = matchSorterUtils.compareItems(rowA.columnFiltersMeta[columnId], rowB.columnFiltersMeta[columnId]);
    }
    // Provide a fallback for when the item ranks are equal
    return dir === 0
        ? reactTable.sortingFns.alphanumeric(rowA, rowB, columnId)
        : dir;
};
const MRT_SortingFns = {
    ...reactTable.sortingFns,
    fuzzy: fuzzy$1,
};
const rankGlobalFuzzy = (rowA, rowB) => Math.max(...Object.values(rowB.columnFiltersMeta).map((v) => v.rank)) -
    Math.max(...Object.values(rowA.columnFiltersMeta).map((v) => v.rank));

const parseFromValuesOrFunc = (fn, arg) => (fn instanceof Function ? fn(arg) : fn);

const getMRT_Rows = (table, all) => {
    const { getCenterRows, getPrePaginationRowModel, getRowModel, getState, getTopRows, options: { createDisplayMode, enablePagination, enableRowPinning, manualPagination, positionCreatingRow, rowPinningDisplayMode, }, } = table;
    const { creatingRow, pagination } = getState();
    const isRankingRows = getIsRankingRows(table);
    let rows = [];
    if (!isRankingRows) {
        rows =
            !enableRowPinning || rowPinningDisplayMode?.includes("sticky")
                ? all
                    ? getPrePaginationRowModel().rows
                    : getRowModel().rows
                : getCenterRows();
    }
    else {
        // fuzzy ranking adjustments
        rows = getPrePaginationRowModel().rows.sort((a, b) => rankGlobalFuzzy(a, b));
        if (enablePagination && !manualPagination && !all) {
            const start = pagination.pageIndex * pagination.pageSize;
            rows = rows.slice(start, start + pagination.pageSize);
        }
        if (enableRowPinning && !rowPinningDisplayMode?.includes("sticky")) {
            // "re-center-ize" the rows (no top or bottom pinned rows unless sticky)
            rows = rows.filter((row) => !row.getIsPinned());
        }
    }
    // row pinning adjustments
    if (enableRowPinning && rowPinningDisplayMode?.includes("sticky")) {
        const centerPinnedRowIds = rows
            .filter((row) => row.getIsPinned())
            .map((r) => r.id);
        rows = [
            ...getTopRows().filter((row) => !centerPinnedRowIds.includes(row.id)),
            ...rows,
        ];
    }
    // blank inserted creating row adjustments
    if (positionCreatingRow !== undefined &&
        creatingRow &&
        createDisplayMode === "row") {
        const creatingRowIndex = !isNaN(+positionCreatingRow)
            ? +positionCreatingRow
            : positionCreatingRow === "top"
                ? 0
                : rows.length;
        rows = [
            ...rows.slice(0, creatingRowIndex),
            creatingRow,
            ...rows.slice(creatingRowIndex),
        ];
    }
    return rows;
};
const getCanRankRows = (table) => {
    const { getState, options: { enableGlobalFilterRankedResults, manualExpanding, manualFiltering, manualGrouping, manualSorting, }, } = table;
    const { expanded, globalFilterFn } = getState();
    return (!manualExpanding &&
        !manualFiltering &&
        !manualGrouping &&
        !manualSorting &&
        enableGlobalFilterRankedResults &&
        globalFilterFn === "fuzzy" &&
        expanded !== true &&
        !Object.values(expanded).some(Boolean));
};
const getIsRankingRows = (table) => {
    const { globalFilter, sorting } = table.getState();
    return (getCanRankRows(table) &&
        globalFilter &&
        !Object.values(sorting).some(Boolean));
};
const getIsRowSelected = ({ row, table, }) => {
    const { options: { enableRowSelection }, } = table;
    return (row.getIsSelected() ||
        (parseFromValuesOrFunc(enableRowSelection, row) &&
            row.getCanSelectSubRows() &&
            row.getIsAllSubRowsSelected()));
};
const getMRT_RowSelectionHandler = ({ renderedRowIndex = 0, row, table, }) => (event, value) => {
    const { getState, options: { enableBatchRowSelection, enableMultiRowSelection, enableRowPinning, manualPagination, rowPinningDisplayMode, }, refs: { lastSelectedRowId }, } = table;
    const { pagination: { pageIndex, pageSize }, } = getState();
    const paginationOffset = manualPagination ? 0 : pageSize * pageIndex;
    const wasCurrentRowChecked = getIsRowSelected({ row, table });
    // toggle selection of this row
    row.toggleSelected(value ?? !wasCurrentRowChecked);
    const changedRowIds = new Set([row.id]);
    // if shift key is pressed, select all rows between last selected and this one
    if (enableBatchRowSelection &&
        enableMultiRowSelection &&
        event.nativeEvent.shiftKey &&
        lastSelectedRowId.current !== null) {
        const rows = getMRT_Rows(table, true);
        const lastIndex = rows.findIndex((r) => r.id === lastSelectedRowId.current);
        if (lastIndex !== -1) {
            const isLastIndexChecked = getIsRowSelected({
                row: rows?.[lastIndex],
                table,
            });
            const currentIndex = renderedRowIndex + paginationOffset;
            const [start, end] = lastIndex < currentIndex
                ? [lastIndex, currentIndex]
                : [currentIndex, lastIndex];
            // toggle selection of all rows between last selected and this one
            // but only if the last selected row is not the same as the current one
            if (wasCurrentRowChecked !== isLastIndexChecked) {
                for (let i = start; i <= end; i++) {
                    rows[i].toggleSelected(!wasCurrentRowChecked);
                    changedRowIds.add(rows[i].id);
                }
            }
        }
    }
    // record the last selected row id
    lastSelectedRowId.current = row.id;
    // if all sub rows were selected, unselect them
    if (row.getCanSelectSubRows() && row.getIsAllSubRowsSelected()) {
        row.subRows?.forEach((r) => r.toggleSelected(false));
    }
    if (enableRowPinning && rowPinningDisplayMode?.includes("select")) {
        changedRowIds.forEach((rowId) => {
            const rowToTogglePin = table.getRow(rowId);
            rowToTogglePin.pin(!wasCurrentRowChecked //was not previously pinned or selected
                ? rowPinningDisplayMode?.includes("bottom")
                    ? "bottom"
                    : "top"
                : false);
        });
    }
};
const getMRT_SelectAllHandler = ({ table }) => (event, value, forceAll) => {
    const { options: { enableRowPinning, rowPinningDisplayMode, selectAllMode }, refs: { lastSelectedRowId }, } = table;
    if (selectAllMode === "all" || forceAll) {
        table.toggleAllRowsSelected(value ?? event.target.checked);
    }
    else {
        table.toggleAllPageRowsSelected(value ?? event.target.checked);
    }
    if (enableRowPinning && rowPinningDisplayMode?.includes("select")) {
        table.setRowPinning({ bottom: [], top: [] });
    }
    lastSelectedRowId.current = null;
};

const useMRT_Rows = (table) => {
    const { getRowModel, getState, options: { data, enableGlobalFilterRankedResults, positionCreatingRow }, } = table;
    const { creatingRow, expanded, globalFilter, pagination, rowPinning, sorting, } = getState();
    const rows = react.useMemo(() => getMRT_Rows(table), [
        creatingRow,
        data,
        enableGlobalFilterRankedResults,
        expanded,
        getRowModel().rows,
        globalFilter,
        pagination.pageIndex,
        pagination.pageSize,
        positionCreatingRow,
        rowPinning,
        sorting,
    ]);
    return rows;
};

const extraIndexRangeExtractor = (range, draggingIndex) => {
    const newIndexes = reactVirtual.defaultRangeExtractor(range);
    if (draggingIndex === undefined)
        return newIndexes;
    if (draggingIndex >= 0 &&
        draggingIndex < Math.max(range.startIndex - range.overscan, 0)) {
        newIndexes.unshift(draggingIndex);
    }
    if (draggingIndex >= 0 && draggingIndex > range.endIndex + range.overscan) {
        newIndexes.push(draggingIndex);
    }
    return newIndexes;
};

const useMRT_RowVirtualizer = (table, rows) => {
    const { getRowModel, getState, options: { enableRowVirtualization, renderDetailPanel, rowVirtualizerInstanceRef, rowVirtualizerOptions, }, refs: { tableContainerRef }, } = table;
    const { density, draggingRow, expanded } = getState();
    if (!enableRowVirtualization)
        return undefined;
    const rowVirtualizerProps = parseFromValuesOrFunc(rowVirtualizerOptions, {
        table,
    });
    const rowCount = rows?.length ?? getRowModel().rows.length;
    const defaultRowHeightByDensity = {
        lg: 62.7,
        md: 54.7,
        sm: 48.7,
        xl: 70.7,
        xs: 42.7,
    };
    const normalRowHeight = defaultRowHeightByDensity[density] ?? defaultRowHeightByDensity["md"];
    const rowVirtualizer = reactVirtual.useVirtualizer({
        count: renderDetailPanel ? rowCount * 2 : rowCount,
        estimateSize: (index) => renderDetailPanel && index % 2 === 1
            ? expanded === true
                ? 100
                : 0
            : normalRowHeight,
        getScrollElement: () => tableContainerRef.current,
        measureElement: typeof window !== "undefined" &&
            navigator.userAgent.indexOf("Firefox") === -1
            ? (element) => element?.getBoundingClientRect().height
            : undefined,
        overscan: 4,
        rangeExtractor: react.useCallback((range) => {
            const current_index = getRowModel().rows.findIndex((row) => row.id === draggingRow?.id);
            return extraIndexRangeExtractor(range, current_index >= 0 ? current_index : 0);
        }, [draggingRow]),
        ...rowVirtualizerProps,
    });
    rowVirtualizer.virtualRows = rowVirtualizer.getVirtualItems();
    if (rowVirtualizerInstanceRef) {
        //@ts-expect-error
        rowVirtualizerInstanceRef.current = rowVirtualizer;
    }
    return rowVirtualizer;
};

var classes$C = {"root":"MRT_TableBody-module_root__kGhRy","root-grid":"MRT_TableBody-module_root-grid__WdOGg","root-no-rows":"MRT_TableBody-module_root-no-rows__iyi9K","root-virtualized":"MRT_TableBody-module_root-virtualized__TxPAi","empty-row-tr-grid":"MRT_TableBody-module_empty-row-tr-grid__LTgxw","empty-row-td-grid":"MRT_TableBody-module_empty-row-td-grid__pzlgG","empty-row-td-content":"MRT_TableBody-module_empty-row-td-content__Cc2XW","pinned":"MRT_TableBody-module_pinned__XHpcs"};

const MRT_EditCellTextInput = ({ cell, table, ...rest }) => {
    const { getState, options: { createDisplayMode, editDisplayMode, mantineEditSelectProps, mantineEditTextInputProps, }, refs: { editInputRefs }, setCreatingRow, setEditingCell, setEditingRow, } = table;
    const { column, row } = cell;
    const { columnDef } = column;
    const { creatingRow, editingRow } = getState();
    const isCreating = creatingRow?.id === row.id;
    const isEditing = editingRow?.id === row.id;
    const isSelectEdit = columnDef.editVariant === "select";
    const isMultiSelectEdit = columnDef.editVariant === "multi-select";
    const [value, setValue] = react.useState(() => cell.getValue());
    const arg = { cell, column, row, table };
    const textInputProps = {
        ...parseFromValuesOrFunc(mantineEditTextInputProps, arg),
        ...parseFromValuesOrFunc(columnDef.mantineEditTextInputProps, arg),
        ...rest,
    };
    const selectProps = {
        ...parseFromValuesOrFunc(mantineEditSelectProps, arg),
        ...parseFromValuesOrFunc(columnDef.mantineEditSelectProps, arg),
        ...rest,
    };
    const saveInputValueToRowCache = (newValue) => {
        //@ts-expect-error
        row._valuesCache[column.id] = newValue;
        if (isCreating) {
            setCreatingRow(row);
        }
        else if (isEditing) {
            setEditingRow(row);
        }
    };
    const handleBlur = (event) => {
        textInputProps.onBlur?.(event);
        saveInputValueToRowCache(value);
        setEditingCell(null);
    };
    const handleEnterKeyDown = (event) => {
        textInputProps.onKeyDown?.(event);
        if (event.key === "Enter") {
            editInputRefs.current[cell.id]?.blur();
        }
    };
    if (columnDef.Edit) {
        return columnDef.Edit?.({ cell, column, row, table });
    }
    const commonProps = {
        disabled: parseFromValuesOrFunc(columnDef.enableEditing, row) === false,
        label: ["custom", "modal"].includes((isCreating ? createDisplayMode : editDisplayMode))
            ? column.columnDef.header
            : undefined,
        name: cell.id,
        onClick: (e) => {
            e.stopPropagation();
            textInputProps?.onClick?.(e);
        },
        placeholder: !["custom", "modal"].includes((isCreating ? createDisplayMode : editDisplayMode))
            ? columnDef.header
            : undefined,
        value,
        variant: editDisplayMode === "table" ? "unstyled" : "default",
    };
    if (isSelectEdit) {
        return (jsxRuntime.jsx(core.Select, { ...commonProps, searchable: true, value: value, ...selectProps, onBlur: handleBlur, onChange: (value, option) => {
                selectProps.onChange?.(value, option);
                setValue(value);
            }, onClick: (e) => {
                e.stopPropagation();
                selectProps?.onClick?.(e);
            }, ref: (node) => {
                if (node) {
                    editInputRefs.current[cell.id] = node;
                    if (selectProps.ref) {
                        selectProps.ref.current = node;
                    }
                }
            } }));
    }
    if (isMultiSelectEdit) {
        return (jsxRuntime.jsx(core.MultiSelect, { ...commonProps, searchable: true, value: value, ...selectProps, onBlur: handleBlur, onChange: (newValue) => {
                selectProps.onChange?.(value);
                setValue(newValue);
                // Save if not in focus, otherwise it will be handled by onBlur
                if (document.activeElement === editInputRefs.current[cell.id])
                    return;
                saveInputValueToRowCache(newValue);
            }, onClick: (e) => {
                e.stopPropagation();
                selectProps?.onClick?.(e);
            }, ref: (node) => {
                if (node) {
                    editInputRefs.current[cell.id] = node;
                    if (selectProps.ref) {
                        selectProps.ref.current = node;
                    }
                }
            } }));
    }
    return (jsxRuntime.jsx(core.TextInput, { ...commonProps, onKeyDown: handleEnterKeyDown, value: value ?? "", ...textInputProps, onBlur: handleBlur, onChange: (event) => {
            textInputProps.onChange?.(event);
            setValue(event.target.value);
        }, onClick: (event) => {
            event.stopPropagation();
            textInputProps?.onClick?.(event);
        }, ref: (node) => {
            if (node) {
                editInputRefs.current[cell.id] = node;
                if (textInputProps.ref) {
                    textInputProps.ref.current = node;
                }
            }
        } }));
};

var classes$B = {"root":"MRT_ExpandButton-module_root__IFYio","root-ltr":"MRT_ExpandButton-module_root-ltr__FHNnp","chevron":"MRT_ExpandButton-module_chevron__XzC5P","right":"MRT_ExpandButton-module_right__-pC-A","up":"MRT_ExpandButton-module_up__TZGBo","root-rtl":"MRT_ExpandButton-module_root-rtl__zoudS"};

const MRT_ExpandButton = ({ row, table, ...rest }) => {
    const direction = core.useDirection();
    const { options: { icons: { IconChevronDown }, localization, mantineExpandButtonProps, positionExpandColumn, renderDetailPanel, }, } = table;
    const actionIconProps = {
        ...parseFromValuesOrFunc(mantineExpandButtonProps, {
            row,
            table,
        }),
        ...rest,
    };
    const internalEditComponents = row
        .getAllCells()
        .filter((cell) => cell.column.columnDef.columnDefType === "data")
        .map((cell) => (jsxRuntime.jsx(MRT_EditCellTextInput, { cell: cell, table: table }, cell.id)));
    const canExpand = row.getCanExpand();
    const isExpanded = row.getIsExpanded();
    const DetailPanel = !!renderDetailPanel?.({
        internalEditComponents,
        row,
        table,
    });
    const handleToggleExpand = (event) => {
        event.stopPropagation();
        row.toggleExpanded();
        actionIconProps?.onClick?.(event);
    };
    const rtl = direction.dir === "rtl" || positionExpandColumn === "last";
    return (jsxRuntime.jsx(core.Tooltip, { disabled: !canExpand && !DetailPanel, label: actionIconProps?.title ??
            (isExpanded ? localization.collapse : localization.expand), openDelay: 1000, withinPortal: true, children: jsxRuntime.jsx(core.ActionIcon, { "aria-label": localization.expand, color: "gray", disabled: !canExpand && !DetailPanel, variant: "subtle", ...actionIconProps, __vars: {
                "--mrt-row-depth": `${row.depth}`,
            }, className: clsx("mrt-expand-button", classes$B.root, classes$B[`root-${rtl ? "rtl" : "ltr"}`], actionIconProps?.className), onClick: handleToggleExpand, title: undefined, children: actionIconProps?.children ?? (jsxRuntime.jsx(IconChevronDown, { className: clsx("mrt-expand-button-chevron", classes$B.chevron, !canExpand && !renderDetailPanel
                    ? classes$B.right
                    : isExpanded
                        ? classes$B.up
                        : undefined) })) }) }));
};

const parseCSSVarId = (id) => id.replace(/[^a-zA-Z0-9]/g, "_");
const getPrimaryShade = (theme) => typeof theme.primaryShade === "number"
    ? theme.primaryShade
    : (theme.primaryShade?.dark ?? 7);
const getPrimaryColor = (theme, shade) => theme.colors[theme.primaryColor][shade ?? getPrimaryShade(theme)];
function dataVariable(name, value) {
    const key = `data-${name}`;
    switch (typeof value) {
        case "boolean":
            return value ? { [key]: "" } : null;
        case "number":
            return { [key]: `${value}` };
        case "string":
            return { [key]: value };
        default:
            return null;
    }
}

var classes$A = {"root":"MRT_CopyButton-module_root__mkXy4"};

const MRT_CopyButton = ({ cell, children, table, ...rest }) => {
    const { options: { localization: { clickToCopy, copiedToClipboard }, mantineCopyButtonProps, }, } = table;
    const { column, row } = cell;
    const { columnDef } = column;
    const arg = { cell, column, row, table };
    const buttonProps = {
        ...parseFromValuesOrFunc(mantineCopyButtonProps, arg),
        ...parseFromValuesOrFunc(columnDef.mantineCopyButtonProps, arg),
        ...rest,
    };
    return (jsxRuntime.jsx(core.CopyButton, { value: cell.getValue(), children: ({ copied, copy }) => (jsxRuntime.jsx(core.Tooltip, { color: copied ? "green" : undefined, label: buttonProps?.title ?? (copied ? copiedToClipboard : clickToCopy), openDelay: 1000, withinPortal: true, children: jsxRuntime.jsx(core.UnstyledButton, { ...buttonProps, className: clsx("mrt-copy-button", classes$A.root, buttonProps?.className), onClick: (e) => {
                    e.stopPropagation();
                    copy();
                }, role: "presentation", title: undefined, children: children }) })) }));
};

var classes$z = {"root":"MRT_TableBodyCell-module_root__Wf-zi","root-grid":"MRT_TableBodyCell-module_root-grid__zIuC-","root-virtualized":"MRT_TableBodyCell-module_root-virtualized__jLl8R","root-data-col":"MRT_TableBodyCell-module_root-data-col__HHcxc","root-nowrap":"MRT_TableBodyCell-module_root-nowrap__-k1Jo","root-cursor-pointer":"MRT_TableBodyCell-module_root-cursor-pointer__4kw7J","root-editable-hover":"MRT_TableBodyCell-module_root-editable-hover__2DKSa","root-cell-hover-reveal":"MRT_TableBodyCell-module_root-cell-hover-reveal__T1fAH","cell-hover-reveal":"MRT_TableBodyCell-module_cell-hover-reveal__Q-1Xj","overflowing":"MRT_TableBodyCell-module_overflowing__QcXP4"};

const allowedTypes = ["string", "number"];
const allowedFilterVariants = ["text", "autocomplete"];
const MRT_TableBodyCellValue = ({ cell, renderedColumnIndex = 0, renderedRowIndex = 0, table, }) => {
    const { getState, options: { enableFilterMatchHighlighting, mantineHighlightProps = { size: "sm" }, }, } = table;
    const { column, row } = cell;
    const { columnDef } = column;
    const { globalFilter, globalFilterFn } = getState();
    const filterValue = column.getFilterValue();
    const highlightProps = parseFromValuesOrFunc(mantineHighlightProps, {
        cell,
        column,
        row,
        table,
    });
    let renderedCellValue = cell.getIsAggregated() && columnDef.AggregatedCell
        ? columnDef.AggregatedCell({
            cell,
            column,
            row,
            table,
        })
        : row.getIsGrouped() && !cell.getIsGrouped()
            ? null
            : cell.getIsGrouped() && columnDef.GroupedCell
                ? columnDef.GroupedCell({
                    cell,
                    column,
                    row,
                    table,
                })
                : undefined;
    const isGroupedValue = renderedCellValue !== undefined;
    if (!isGroupedValue) {
        renderedCellValue = cell.renderValue();
    }
    if (enableFilterMatchHighlighting &&
        columnDef.enableFilterMatchHighlighting !== false &&
        renderedCellValue &&
        allowedTypes.includes(typeof renderedCellValue) &&
        ((filterValue &&
            allowedTypes.includes(typeof filterValue) &&
            allowedFilterVariants.includes(columnDef.filterVariant)) ||
            (globalFilter &&
                allowedTypes.includes(typeof globalFilter) &&
                column.getCanGlobalFilter()))) {
        let highlight = (column.getFilterValue() ??
            globalFilter ??
            "").toString();
        if ((filterValue ? columnDef._filterFn : globalFilterFn) === "fuzzy") {
            highlight = highlight.split(" ");
        }
        renderedCellValue = (jsxRuntime.jsx(core.Highlight, { color: "yellow.3", highlight: highlight, ...highlightProps, children: renderedCellValue?.toString() }));
    }
    if (columnDef.Cell && !isGroupedValue) {
        renderedCellValue = columnDef.Cell({
            cell,
            column,
            renderedCellValue,
            renderedColumnIndex,
            renderedRowIndex,
            row,
            table,
        });
    }
    return renderedCellValue;
};

const MRT_TableBodyCell = ({ cell, numRows = 1, renderedColumnIndex = 0, renderedRowIndex = 0, rowRef, table, virtualCell, ...rest }) => {
    const direction = core.useDirection();
    const { getState, options: { columnResizeDirection, columnResizeMode, createDisplayMode, editDisplayMode, enableClickToCopy, enableColumnOrdering, enableColumnPinning, enableEditing, enableGrouping, layoutMode, mantineSkeletonProps, mantineTableBodyCellProps, }, refs: { editInputRefs }, setEditingCell, setHoveredColumn, } = table;
    const { columnSizingInfo, creatingRow, density, draggingColumn, editingCell, editingRow, hoveredColumn, isLoading, showSkeletons, } = getState();
    const { column, row } = cell;
    const { columnDef } = column;
    const { columnDefType } = columnDef;
    const args = {
        cell,
        column,
        renderedColumnIndex,
        renderedRowIndex,
        row,
        table,
    };
    const tableCellProps = {
        ...parseFromValuesOrFunc(mantineTableBodyCellProps, args),
        ...parseFromValuesOrFunc(columnDef.mantineTableBodyCellProps, args),
        ...rest,
    };
    const skeletonProps = parseFromValuesOrFunc(mantineSkeletonProps, args);
    const [skeletonWidth, setSkeletonWidth] = react.useState(100);
    react.useEffect(() => {
        if ((!isLoading && !showSkeletons) || skeletonWidth !== 100)
            return;
        const size = column.getSize();
        setSkeletonWidth(columnDefType === "display"
            ? size / 2
            : Math.round(Math.random() * (size - size / 3) + size / 3));
    }, [isLoading, showSkeletons]);
    const widthStyles = {
        minWidth: `max(calc(var(--col-${parseCSSVarId(column?.id)}-size) * 1px), ${columnDef.minSize ?? 30}px)`,
        width: `calc(var(--col-${parseCSSVarId(column.id)}-size) * 1px)`,
    };
    if (layoutMode === "grid") {
        widthStyles.flex = `${[0, false].includes(columnDef.grow)
            ? 0
            : `var(--col-${parseCSSVarId(column.id)}-size)`} 0 auto`;
    }
    else if (layoutMode === "grid-no-grow") {
        widthStyles.flex = `${+(columnDef.grow || 0)} 0 auto`;
    }
    const isDraggingColumn = draggingColumn?.id === column.id;
    const isHoveredColumn = hoveredColumn?.id === column.id;
    const isColumnPinned = enableColumnPinning &&
        columnDef.columnDefType !== "group" &&
        column.getIsPinned();
    const isEditable = !cell.getIsPlaceholder() &&
        parseFromValuesOrFunc(enableEditing, row) &&
        parseFromValuesOrFunc(columnDef.enableEditing, row) !== false;
    const isEditing = isEditable &&
        !["custom", "modal"].includes(editDisplayMode) &&
        (editDisplayMode === "table" ||
            editingRow?.id === row.id ||
            editingCell?.id === cell.id) &&
        !row.getIsGrouped();
    const isCreating = isEditable && createDisplayMode === "row" && creatingRow?.id === row.id;
    const showClickToCopyButton = parseFromValuesOrFunc(enableClickToCopy, cell) ||
        (parseFromValuesOrFunc(columnDef.enableClickToCopy, cell) &&
            parseFromValuesOrFunc(columnDef.enableClickToCopy, cell) !== false);
    const handleDoubleClick = (event) => {
        tableCellProps?.onDoubleClick?.(event);
        if (isEditable && editDisplayMode === "cell") {
            setEditingCell(cell);
            setTimeout(() => {
                const textField = editInputRefs.current[cell.id];
                if (textField) {
                    textField.focus();
                    textField.select?.();
                }
            }, 100);
        }
    };
    const handleDragEnter = (e) => {
        tableCellProps?.onDragEnter?.(e);
        if (enableGrouping && hoveredColumn?.id === "drop-zone") {
            setHoveredColumn(null);
        }
        if (enableColumnOrdering && draggingColumn) {
            setHoveredColumn(columnDef.enableColumnOrdering !== false ? column : null);
        }
    };
    const cellValueProps = {
        cell,
        renderedColumnIndex,
        renderedRowIndex,
        table,
    };
    const cellHoverRevealDivRef = react.useRef(null);
    const [isCellContentOverflowing, setIsCellContentOverflowing] = react.useState(false);
    const onMouseEnter = () => {
        if (!columnDef.enableCellHoverReveal)
            return;
        const div = cellHoverRevealDivRef.current;
        if (div) {
            const isOverflow = div.scrollWidth > div.clientWidth;
            setIsCellContentOverflowing(isOverflow);
        }
    };
    const onMouseLeave = () => {
        if (!columnDef.enableCellHoverReveal)
            return;
        setIsCellContentOverflowing(false);
    };
    const renderCellContent = () => {
        if (cell.getIsPlaceholder()) {
            return columnDef.PlaceholderCell?.({ cell, column, row, table }) ?? null;
        }
        if (showSkeletons !== false && (isLoading || showSkeletons)) {
            return jsxRuntime.jsx(core.Skeleton, { height: 20, width: skeletonWidth, ...skeletonProps });
        }
        if (columnDefType === "display" &&
            (["mrt-row-expand", "mrt-row-numbers", "mrt-row-select"].includes(column.id) ||
                !row.getIsGrouped())) {
            return columnDef.Cell?.({
                column,
                renderedCellValue: cell.renderValue(),
                row,
                rowRef,
                ...cellValueProps,
            });
        }
        if (isCreating || isEditing) {
            return jsxRuntime.jsx(MRT_EditCellTextInput, { cell: cell, table: table });
        }
        if (showClickToCopyButton && columnDef.enableClickToCopy !== false) {
            return (jsxRuntime.jsx(MRT_CopyButton, { cell: cell, table: table, children: jsxRuntime.jsx(MRT_TableBodyCellValue, { ...cellValueProps }) }));
        }
        return jsxRuntime.jsx(MRT_TableBodyCellValue, { ...cellValueProps });
    };
    return (jsxRuntime.jsx(core.TableTd, { "data-column-pinned": isColumnPinned || undefined, "data-dragging-column": isDraggingColumn || undefined, "data-first-right-pinned": (isColumnPinned === "right" &&
            column.getIsFirstColumn(isColumnPinned)) ||
            undefined, "data-hovered-column-target": isHoveredColumn || undefined, "data-index": renderedColumnIndex, "data-last-left-pinned": (isColumnPinned === "left" && column.getIsLastColumn(isColumnPinned)) ||
            undefined, "data-last-row": renderedRowIndex === numRows - 1 || undefined, "data-resizing": (columnResizeMode === "onChange" &&
            columnSizingInfo?.isResizingColumn === column.id &&
            columnResizeDirection) ||
            undefined, ...tableCellProps, __vars: {
            "--mrt-cell-align": tableCellProps.align ?? (direction.dir === "rtl" ? "right" : "left"),
            "--mrt-table-cell-left": isColumnPinned === "left"
                ? `${column.getStart(isColumnPinned)}`
                : undefined,
            "--mrt-table-cell-right": isColumnPinned === "right"
                ? `${column.getAfter(isColumnPinned)}`
                : undefined,
            ...tableCellProps.__vars,
        }, className: clsx(classes$z.root, layoutMode?.startsWith("grid") && classes$z["root-grid"], virtualCell && classes$z["root-virtualized"], isEditable &&
            editDisplayMode === "cell" &&
            classes$z["root-cursor-pointer"], isEditable &&
            ["cell", "table"].includes(editDisplayMode ?? "") &&
            columnDefType !== "display" &&
            classes$z["root-editable-hover"], columnDefType === "data" && classes$z["root-data-col"], density === "xs" && classes$z["root-nowrap"], columnDef.enableCellHoverReveal && classes$z["root-cell-hover-reveal"], tableCellProps?.className), onDoubleClick: handleDoubleClick, onDragEnter: handleDragEnter, onMouseEnter: onMouseEnter, onMouseLeave: onMouseLeave, style: (theme) => ({
            ...widthStyles,
            ...parseFromValuesOrFunc(tableCellProps.style, theme),
        }), children: jsxRuntime.jsx(jsxRuntime.Fragment, { children: tableCellProps.children ??
                (columnDef.enableCellHoverReveal ? (jsxRuntime.jsxs("div", { className: clsx(columnDef.enableCellHoverReveal &&
                        !(isCreating || isEditing) &&
                        classes$z["cell-hover-reveal"], isCellContentOverflowing && classes$z["overflowing"]), ref: cellHoverRevealDivRef, children: [renderCellContent(), cell.getIsGrouped() && !columnDef.GroupedCell && (jsxRuntime.jsxs(jsxRuntime.Fragment, { children: [" (", row.subRows?.length, ")"] }))] })) : (jsxRuntime.jsxs(jsxRuntime.Fragment, { children: [renderCellContent(), cell.getIsGrouped() && !columnDef.GroupedCell && (jsxRuntime.jsxs(jsxRuntime.Fragment, { children: [" (", row.subRows?.length, ")"] }))] }))) }) }));
};
const Memo_MRT_TableBodyCell = react.memo(MRT_TableBodyCell, (prev, next) => next.cell === prev.cell);

var classes$y = {"root":"MRT_TableBodyRow-module_root__2c3D4","root-grid":"MRT_TableBodyRow-module_root-grid__AwXTe","root-virtualized":"MRT_TableBodyRow-module_root-virtualized__zYgxq"};

var classes$x = {"root":"MRT_TableDetailPanel-module_root__vQAlM","root-grid":"MRT_TableDetailPanel-module_root-grid__7UMC6","root-virtual-row":"MRT_TableDetailPanel-module_root-virtual-row__r-X4Z","inner":"MRT_TableDetailPanel-module_inner__o-Fk-","inner-grid":"MRT_TableDetailPanel-module_inner-grid__WLZgF","inner-expanded":"MRT_TableDetailPanel-module_inner-expanded__6tg9T","inner-virtual":"MRT_TableDetailPanel-module_inner-virtual__TItRy"};

const MRT_TableDetailPanel = ({ parentRowRef, renderedRowIndex = 0, row, rowVirtualizer, striped, table, virtualRow, ...rest }) => {
    const { getState, getVisibleLeafColumns, options: { layoutMode, mantineDetailPanelProps, mantineTableBodyRowProps, renderDetailPanel, }, } = table;
    const { isLoading } = getState();
    const tableRowProps = parseFromValuesOrFunc(mantineTableBodyRowProps, {
        isDetailPanel: true,
        row,
        table,
    });
    const tableCellProps = {
        ...parseFromValuesOrFunc(mantineDetailPanelProps, {
            row,
            table,
        }),
        ...rest,
    };
    const internalEditComponents = row
        .getAllCells()
        .filter((cell) => cell.column.columnDef.columnDefType === "data")
        .map((cell) => (jsxRuntime.jsx(MRT_EditCellTextInput, { cell: cell, table: table }, cell.id)));
    const DetailPanel = !isLoading &&
        row.getIsExpanded() &&
        renderDetailPanel?.({ internalEditComponents, row, table });
    return (jsxRuntime.jsx(core.TableTr, { "data-index": renderDetailPanel ? renderedRowIndex * 2 + 1 : renderedRowIndex, "data-striped": striped, ref: (node) => {
            if (node) {
                rowVirtualizer?.measureElement?.(node);
            }
        }, ...tableRowProps, __vars: {
            "--mrt-parent-row-height": virtualRow
                ? `${parentRowRef.current?.getBoundingClientRect()?.height}px`
                : undefined,
            "--mrt-virtual-row-start": virtualRow
                ? `${virtualRow.start}px`
                : undefined,
            ...tableRowProps?.__vars,
        }, className: clsx("mantine-Table-tr-detail-panel", classes$x.root, layoutMode?.startsWith("grid") && classes$x["root-grid"], virtualRow && classes$x["root-virtual-row"], tableRowProps?.className), children: jsxRuntime.jsx(core.TableTd, { colSpan: getVisibleLeafColumns().length, component: "td", ...tableCellProps, __vars: {
                "--mrt-inner-width": `${table.getTotalSize()}px`,
            }, className: clsx("mantine-Table-td-detail-panel", classes$x.inner, layoutMode?.startsWith("grid") && classes$x["inner-grid"], row.getIsExpanded() && classes$x["inner-expanded"], virtualRow && classes$x["inner-virtual"]), p: row.getIsExpanded() && DetailPanel ? "md" : 0, children: rowVirtualizer ? (row.getIsExpanded() && DetailPanel) : (jsxRuntime.jsx(core.Collapse, { in: row.getIsExpanded(), children: DetailPanel })) }) }));
};

const MRT_TableBodyRow = ({ children, columnVirtualizer, numRows, pinnedRowIds, renderedRowIndex = 0, row, rowVirtualizer, table, tableProps, virtualRow, ...rest }) => {
    const { getState, options: { enableRowOrdering, enableRowPinning, enableStickyFooter, enableStickyHeader, layoutMode, mantineTableBodyRowProps, memoMode, renderDetailPanel, rowPinningDisplayMode, }, refs: { tableFooterRef, tableHeadRef }, setHoveredRow, } = table;
    const { density, draggingColumn, draggingRow, editingCell, editingRow, hoveredRow, isFullScreen, rowPinning, } = getState();
    const visibleCells = row.getVisibleCells();
    const { virtualColumns, virtualPaddingLeft, virtualPaddingRight } = columnVirtualizer ?? {};
    const isRowSelected = getIsRowSelected({ row, table });
    const isRowPinned = enableRowPinning && row.getIsPinned();
    const isRowStickyPinned = isRowPinned && rowPinningDisplayMode?.includes("sticky") && "sticky";
    const isDraggingRow = draggingRow?.id === row.id;
    const isHoveredRow = hoveredRow?.id === row.id;
    const tableRowProps = {
        ...parseFromValuesOrFunc(mantineTableBodyRowProps, {
            renderedRowIndex,
            row,
            table,
        }),
        ...rest,
    };
    const [bottomPinnedIndex, topPinnedIndex] = react.useMemo(() => {
        if (!enableRowPinning ||
            !isRowStickyPinned ||
            !pinnedRowIds ||
            !row.getIsPinned())
            return [];
        return [
            [...pinnedRowIds].reverse().indexOf(row.id),
            pinnedRowIds.indexOf(row.id),
        ];
    }, [pinnedRowIds, rowPinning]);
    const tableHeadHeight = ((enableStickyHeader || isFullScreen) &&
        tableHeadRef.current?.clientHeight) ||
        0;
    const tableFooterHeight = (enableStickyFooter && tableFooterRef.current?.clientHeight) || 0;
    const defaultRowHeightByDensity = {
        lg: 61,
        md: 53,
        sm: 45,
        xl: 69,
        xs: 37,
    };
    const rowHeight = 
    // @ts-expect-error
    parseInt(tableRowProps?.style?.height, 10) ||
        (defaultRowHeightByDensity[density] ?? defaultRowHeightByDensity["md"]);
    const handleDragEnter = (_e) => {
        if (enableRowOrdering && draggingRow) {
            setHoveredRow(row);
        }
    };
    const rowRef = react.useRef(null);
    let striped = tableProps.striped;
    if (striped) {
        if (striped === true) {
            striped = "odd";
        }
        if (striped === "odd" && renderedRowIndex % 2 !== 0) {
            striped = false;
        }
        if (striped === "even" && renderedRowIndex % 2 === 0) {
            striped = false;
        }
    }
    return (jsxRuntime.jsxs(jsxRuntime.Fragment, { children: [jsxRuntime.jsxs(core.TableTr, { "data-dragging-row": isDraggingRow || undefined, "data-hovered-row-target": isHoveredRow || undefined, "data-index": renderDetailPanel ? renderedRowIndex * 2 : renderedRowIndex, "data-row-pinned": isRowStickyPinned || isRowPinned || undefined, "data-selected": isRowSelected || undefined, "data-striped": striped, onDragEnter: handleDragEnter, ref: (node) => {
                    if (node) {
                        rowRef.current = node;
                        rowVirtualizer?.measureElement(node);
                    }
                }, ...tableRowProps, __vars: {
                    ...tableRowProps?.__vars,
                    "--mrt-pinned-row-bottom": !virtualRow && bottomPinnedIndex !== undefined && isRowPinned
                        ? `${bottomPinnedIndex * rowHeight +
                            (enableStickyFooter ? tableFooterHeight - 1 : 0)}`
                        : undefined,
                    "--mrt-pinned-row-top": virtualRow
                        ? undefined
                        : topPinnedIndex !== undefined && isRowPinned
                            ? `${topPinnedIndex * rowHeight +
                                (enableStickyHeader || isFullScreen ? tableHeadHeight - 1 : 0)}`
                            : undefined,
                    "--mrt-virtual-row-start": virtualRow
                        ? `${virtualRow.start}`
                        : undefined,
                }, className: clsx(classes$y.root, layoutMode?.startsWith("grid") && classes$y["root-grid"], virtualRow && classes$y["root-virtualized"], tableRowProps?.className), children: [virtualPaddingLeft ? (jsxRuntime.jsx(core.Box, { component: "td", display: "flex", w: virtualPaddingLeft })) : null, children
                        ? children
                        : (virtualColumns ?? row.getVisibleCells()).map((cellOrVirtualCell, renderedColumnIndex) => {
                            let cell = cellOrVirtualCell;
                            if (columnVirtualizer) {
                                renderedColumnIndex = cellOrVirtualCell
                                    .index;
                                cell = visibleCells[renderedColumnIndex];
                            }
                            const cellProps = {
                                cell,
                                numRows,
                                renderedColumnIndex,
                                renderedRowIndex,
                                rowRef,
                                table,
                                virtualCell: columnVirtualizer
                                    ? cellOrVirtualCell
                                    : undefined,
                            };
                            return memoMode === "cells" &&
                                cell.column.columnDef.columnDefType === "data" &&
                                !draggingColumn &&
                                !draggingRow &&
                                editingCell?.id !== cell.id &&
                                editingRow?.id !== row.id ? (jsxRuntime.jsx(Memo_MRT_TableBodyCell, { ...cellProps }, cell.id)) : (jsxRuntime.jsx(MRT_TableBodyCell, { ...cellProps }, cell.id));
                        }), virtualPaddingRight ? (jsxRuntime.jsx(core.Box, { component: "td", display: "flex", w: virtualPaddingRight })) : null] }), renderDetailPanel && !row.getIsGrouped() && (jsxRuntime.jsx(MRT_TableDetailPanel, { parentRowRef: rowRef, renderedRowIndex: renderedRowIndex, row: row, rowVirtualizer: rowVirtualizer, striped: striped, table: table, virtualRow: virtualRow }))] }));
};
const Memo_MRT_TableBodyRow = react.memo(MRT_TableBodyRow, (prev, next) => prev.row === next.row);

const MRT_TableBodyEmptyRow = ({ table, tableProps, ...commonRowProps }) => {
    const { getState, options: { layoutMode, localization, renderDetailPanel, renderEmptyRowsFallback, }, refs: { tablePaperRef }, } = table;
    const { columnFilters, globalFilter } = getState();
    const emptyRow = react.useMemo(() => reactTable.createRow(table, "mrt-row-empty", {}, 0, 0), []);
    const emptyRowProps = {
        ...commonRowProps,
        renderedRowIndex: 0,
        row: emptyRow,
        virtualRow: undefined,
    };
    return (jsxRuntime.jsxs(MRT_TableBodyRow, { className: clsx("mrt-table-body-row", layoutMode?.startsWith("grid") && classes$C["empty-row-tr-grid"]), table: table, tableProps: tableProps, ...emptyRowProps, children: [renderDetailPanel && (jsxRuntime.jsx(core.TableTd, { className: clsx("mrt-table-body-cell", layoutMode?.startsWith("grid") && classes$C["empty-row-td-grid"]), colSpan: 1, children: jsxRuntime.jsx(MRT_ExpandButton, { row: emptyRow, table: table }) })), jsxRuntime.jsx("td", { className: clsx("mrt-table-body-cell", layoutMode?.startsWith("grid") && classes$C["empty-row-td-grid"]), colSpan: table.getVisibleLeafColumns().length, children: renderEmptyRowsFallback?.({ table }) ?? (jsxRuntime.jsx(core.Text, { __vars: {
                        "--mrt-paper-width": `${tablePaperRef.current?.clientWidth}`,
                    }, className: clsx(classes$C["empty-row-td-content"]), children: globalFilter || columnFilters.length
                        ? localization.noResultsFound
                        : localization.noRecordsToDisplay })) })] }));
};

const MRT_TableBody = ({ columnVirtualizer, table, tableProps, ...rest }) => {
    const { getBottomRows, getIsSomeRowsPinned, getRowModel, getState, getTopRows, options: { enableStickyFooter, enableStickyHeader, layoutMode, mantineTableBodyProps, memoMode, renderDetailPanel, rowPinningDisplayMode, }, refs: { tableFooterRef, tableHeadRef }, } = table;
    const { isFullScreen, rowPinning } = getState();
    const tableBodyProps = {
        ...parseFromValuesOrFunc(mantineTableBodyProps, { table }),
        ...rest,
    };
    const tableHeadHeight = ((enableStickyHeader || isFullScreen) &&
        tableHeadRef.current?.clientHeight) ||
        0;
    const tableFooterHeight = (enableStickyFooter && tableFooterRef.current?.clientHeight) || 0;
    const pinnedRowIds = react.useMemo(() => {
        if (!rowPinning.bottom?.length && !rowPinning.top?.length)
            return [];
        return getRowModel()
            .rows.filter((row) => row.getIsPinned())
            .map((r) => r.id);
    }, [rowPinning, getRowModel().rows]);
    const rows = useMRT_Rows(table);
    const rowVirtualizer = useMRT_RowVirtualizer(table, rows);
    const { virtualRows } = rowVirtualizer ?? {};
    const commonRowProps = {
        columnVirtualizer,
        numRows: rows.length,
        table,
        tableProps,
    };
    return (jsxRuntime.jsxs(jsxRuntime.Fragment, { children: [!rowPinningDisplayMode?.includes("sticky") &&
                getIsSomeRowsPinned("top") && (jsxRuntime.jsx(core.TableTbody, { ...tableBodyProps, __vars: {
                    "--mrt-table-head-height": `${tableHeadHeight}`,
                    ...tableBodyProps?.__vars,
                }, className: clsx(classes$C.pinned, layoutMode?.startsWith("grid") && classes$C["root-grid"], tableBodyProps?.className), children: getTopRows().map((row, renderedRowIndex) => {
                    const rowProps = {
                        ...commonRowProps,
                        renderedRowIndex,
                        row,
                    };
                    return memoMode === "rows" ? (jsxRuntime.jsx(Memo_MRT_TableBodyRow, { ...rowProps }, row.id)) : (jsxRuntime.jsx(MRT_TableBodyRow, { ...rowProps }, row.id));
                }) })), jsxRuntime.jsx(core.TableTbody, { ...tableBodyProps, __vars: {
                    "--mrt-table-body-height": rowVirtualizer
                        ? `${rowVirtualizer.getTotalSize()}px`
                        : undefined,
                    ...tableBodyProps?.__vars,
                }, className: clsx(classes$C.root, layoutMode?.startsWith("grid") && classes$C["root-grid"], !rows.length && classes$C["root-no-rows"], rowVirtualizer && classes$C["root-virtualized"], tableBodyProps?.className), children: tableBodyProps?.children ??
                    (!rows.length ? (jsxRuntime.jsx(MRT_TableBodyEmptyRow, { ...commonRowProps })) : (jsxRuntime.jsx(jsxRuntime.Fragment, { children: (virtualRows ?? rows).map((rowOrVirtualRow, renderedRowIndex) => {
                            if (rowVirtualizer) {
                                if (renderDetailPanel) {
                                    if (rowOrVirtualRow.index % 2 === 1) {
                                        return null;
                                    }
                                    else {
                                        renderedRowIndex = rowOrVirtualRow.index / 2;
                                    }
                                }
                                else {
                                    renderedRowIndex = rowOrVirtualRow.index;
                                }
                            }
                            const row = rowVirtualizer
                                ? rows[renderedRowIndex]
                                : rowOrVirtualRow;
                            const props = {
                                ...commonRowProps,
                                pinnedRowIds,
                                renderedRowIndex,
                                row,
                                rowVirtualizer,
                                virtualRow: rowVirtualizer
                                    ? rowOrVirtualRow
                                    : undefined,
                            };
                            const key = `${row.id}-${row.index}`;
                            return memoMode === "rows" ? (jsxRuntime.jsx(Memo_MRT_TableBodyRow, { ...props }, key)) : (jsxRuntime.jsx(MRT_TableBodyRow, { ...props }, key));
                        }) }))) }), !rowPinningDisplayMode?.includes("sticky") &&
                getIsSomeRowsPinned("bottom") && (jsxRuntime.jsx(core.TableTbody, { ...tableBodyProps, __vars: {
                    "--mrt-table-footer-height": `${tableFooterHeight}`,
                    ...tableBodyProps?.__vars,
                }, className: clsx(classes$C.pinned, layoutMode?.startsWith("grid") && classes$C["root-grid"], tableBodyProps?.className), children: getBottomRows().map((row, renderedRowIndex) => {
                    const props = {
                        ...commonRowProps,
                        renderedRowIndex,
                        row,
                    };
                    return memoMode === "rows" ? (jsxRuntime.jsx(Memo_MRT_TableBodyRow, { ...props }, row.id)) : (jsxRuntime.jsx(MRT_TableBodyRow, { ...props }, row.id));
                }) }))] }));
};
const Memo_MRT_TableBody = react.memo(MRT_TableBody, (prev, next) => prev.table.options.data === next.table.options.data);

var classes$w = {"grab-icon":"MRT_GrabHandleButton-module_grab-icon__mQimy"};

const MRT_GrabHandleButton = ({ actionIconProps, onDragEnd, onDragStart, table: { options: { icons: { IconGripHorizontal }, localization: { move }, }, }, }) => {
    return (jsxRuntime.jsx(core.Tooltip, { label: actionIconProps?.title ?? move, openDelay: 1000, withinPortal: true, children: jsxRuntime.jsx(core.ActionIcon, { "aria-label": actionIconProps?.title ?? move, draggable: true, ...actionIconProps, className: clsx("mrt-grab-handle-button", classes$w["grab-icon"], actionIconProps?.className), color: "gray", onClick: (e) => {
                e.stopPropagation();
                actionIconProps?.onClick?.(e);
            }, onMouseDown: (e) => {
                e.stopPropagation();
                actionIconProps?.onMouseDown?.(e);
            }, onDragEnd: onDragEnd, onDragStart: onDragStart, size: "sm", title: undefined, variant: "transparent", children: jsxRuntime.jsx(IconGripHorizontal, { size: "100%" }) }) }));
};

const MRT_TableBodyRowGrabHandle = ({ row, rowRef, table, ...rest }) => {
    const { options: { mantineRowDragHandleProps }, } = table;
    const actionIconProps = {
        ...parseFromValuesOrFunc(mantineRowDragHandleProps, {
            row,
            table,
        }),
        ...rest,
    };
    const handleDragStart = (event) => {
        actionIconProps?.onDragStart?.(event);
        event.dataTransfer.setDragImage(rowRef.current, 0, 0);
        table.setDraggingRow(row);
    };
    const handleDragEnd = (event) => {
        actionIconProps?.onDragEnd?.(event);
        table.setDraggingRow(null);
        table.setHoveredRow(null);
    };
    return (jsxRuntime.jsx(MRT_GrabHandleButton, { actionIconProps: actionIconProps, onDragEnd: handleDragEnd, onDragStart: handleDragStart, table: table }));
};

const MRT_RowPinButton = ({ pinningPosition, row, table, ...rest }) => {
    const { options: { icons: { IconPinned, IconX }, localization, rowPinningDisplayMode, }, } = table;
    const isPinned = row.getIsPinned();
    const [tooltipOpened, setTooltipOpened] = react.useState(false);
    const handleTogglePin = (event) => {
        setTooltipOpened(false);
        event.stopPropagation();
        row.pin(isPinned ? false : pinningPosition);
    };
    return (jsxRuntime.jsx(core.Tooltip, { label: isPinned ? localization.unpin : localization.pin, openDelay: 1000, opened: tooltipOpened, children: jsxRuntime.jsx(core.ActionIcon, { "aria-label": localization.pin, color: "gray", onClick: handleTogglePin, onMouseEnter: () => setTooltipOpened(true), onMouseLeave: () => setTooltipOpened(false), size: "xs", style: {
                height: "24px",
                width: "24px",
            }, variant: "subtle", ...rest, children: isPinned ? (jsxRuntime.jsx(IconX, {})) : (jsxRuntime.jsx(IconPinned, { fontSize: "small", style: {
                    transform: `rotate(${rowPinningDisplayMode === "sticky"
                        ? 135
                        : pinningPosition === "top"
                            ? 180
                            : 0}deg)`,
                } })) }) }));
};

const MRT_TableBodyRowPinButton = ({ row, table, ...rest }) => {
    const { getState, options: { enableRowPinning, rowPinningDisplayMode }, } = table;
    const { density } = getState();
    const canPin = parseFromValuesOrFunc(enableRowPinning, row);
    if (!canPin)
        return null;
    const rowPinButtonProps = {
        row,
        table,
        ...rest,
    };
    if (rowPinningDisplayMode === "top-and-bottom" && !row.getIsPinned()) {
        return (jsxRuntime.jsxs(core.Box, { style: {
                display: "flex",
                flexDirection: density === "xs" ? "row" : "column",
            }, children: [jsxRuntime.jsx(MRT_RowPinButton, { pinningPosition: "top", ...rowPinButtonProps }), jsxRuntime.jsx(MRT_RowPinButton, { pinningPosition: "bottom", ...rowPinButtonProps })] }));
    }
    return (jsxRuntime.jsx(MRT_RowPinButton, { pinningPosition: rowPinningDisplayMode === "bottom" ? "bottom" : "top", ...rowPinButtonProps }));
};

var classes$v = {"root":"MRT_ColumnPinningButtons-module_root__scTtW","left":"MRT_ColumnPinningButtons-module_left__W6Aog","right":"MRT_ColumnPinningButtons-module_right__7AJE3"};

const MRT_ColumnPinningButtons = ({ column, table, }) => {
    const { options: { icons: { IconPinned, IconPinnedOff }, localization, }, } = table;
    return (jsxRuntime.jsx(core.Flex, { className: clsx("mrt-column-pinning-buttons", classes$v.root), children: column.getIsPinned() ? (jsxRuntime.jsx(core.Tooltip, { label: localization.unpin, withinPortal: true, children: jsxRuntime.jsx(core.ActionIcon, { color: "gray", onClick: () => column.pin(false), size: "md", variant: "subtle", children: jsxRuntime.jsx(IconPinnedOff, {}) }) })) : (jsxRuntime.jsxs(jsxRuntime.Fragment, { children: [jsxRuntime.jsx(core.Tooltip, { label: localization.pinToLeft, withinPortal: true, children: jsxRuntime.jsx(core.ActionIcon, { color: "gray", onClick: () => column.pin("left"), size: "md", variant: "subtle", children: jsxRuntime.jsx(IconPinned, { className: classes$v.left }) }) }), jsxRuntime.jsx(core.Tooltip, { label: localization.pinToRight, withinPortal: true, children: jsxRuntime.jsx(core.ActionIcon, { color: "gray", onClick: () => column.pin("right"), size: "md", variant: "subtle", children: jsxRuntime.jsx(IconPinned, { className: classes$v.right }) }) })] })) }));
};

var classes$u = {"root":"MRT_EditActionButtons-module_root__BfxVZ"};

const MRT_EditActionButtons = ({ row, table, variant = "icon", ...rest }) => {
    const { getState, options: { icons: { IconCircleX, IconDeviceFloppy }, localization, onCreatingRowCancel, onCreatingRowSave, onEditingRowCancel, onEditingRowSave, }, refs: { editInputRefs }, setCreatingRow, setEditingRow, } = table;
    const { creatingRow, editingRow, isSaving } = getState();
    const isCreating = creatingRow?.id === row.id;
    const isEditing = editingRow?.id === row.id;
    const handleCancel = () => {
        if (isCreating) {
            onCreatingRowCancel?.({ row, table });
            setCreatingRow(null);
        }
        else if (isEditing) {
            onEditingRowCancel?.({ row, table });
            setEditingRow(null);
        }
        row._valuesCache = {}; //reset values cache
    };
    const handleSubmitRow = () => {
        //look for auto-filled input values
        Object.values(editInputRefs?.current)
            .filter((inputRef) => row.id === inputRef?.name?.split("_")?.[0])
            ?.forEach((input) => {
            if (input.value !== undefined &&
                Object.hasOwn(row?._valuesCache, input.name)) {
                // @ts-expect-error
                row._valuesCache[input.name] = input.value;
            }
        });
        if (isCreating)
            onCreatingRowSave?.({
                exitCreatingMode: () => setCreatingRow(null),
                row,
                table,
                values: row._valuesCache,
            });
        else if (isEditing) {
            onEditingRowSave?.({
                exitEditingMode: () => setEditingRow(null),
                row,
                table,
                values: row?._valuesCache,
            });
        }
    };
    return (jsxRuntime.jsx(core.Box, { className: clsx("mrt-edit-action-buttons", classes$u.root), onClick: (e) => e.stopPropagation(), ...rest, children: variant === "icon" ? (jsxRuntime.jsxs(jsxRuntime.Fragment, { children: [jsxRuntime.jsx(core.Tooltip, { label: localization.cancel, withinPortal: true, children: jsxRuntime.jsx(core.ActionIcon, { "aria-label": localization.cancel, color: "red", onClick: handleCancel, variant: "subtle", children: jsxRuntime.jsx(IconCircleX, {}) }) }), jsxRuntime.jsx(core.Tooltip, { label: localization.save, withinPortal: true, children: jsxRuntime.jsx(core.ActionIcon, { "aria-label": localization.save, color: "blue", loading: isSaving, onClick: handleSubmitRow, variant: "subtle", children: jsxRuntime.jsx(IconDeviceFloppy, {}) }) })] })) : (jsxRuntime.jsxs(jsxRuntime.Fragment, { children: [jsxRuntime.jsx(core.Button, { onClick: handleCancel, variant: "subtle", children: localization.cancel }), jsxRuntime.jsx(core.Button, { loading: isSaving, onClick: handleSubmitRow, variant: "filled", children: localization.save })] })) }));
};

var classes$t = {"root":"MRT_ExpandAllButton-module_root__gkBZD","chevron":"MRT_ExpandAllButton-module_chevron__Iep0j","up":"MRT_ExpandAllButton-module_up__Xth3U","right":"MRT_ExpandAllButton-module_right__bS4L-"};

const MRT_ExpandAllButton = ({ table, ...rest }) => {
    const { getCanSomeRowsExpand, getIsAllRowsExpanded, getIsSomeRowsExpanded, getState, options: { icons: { IconChevronsDown }, localization, mantineExpandAllButtonProps, renderDetailPanel, }, toggleAllRowsExpanded, } = table;
    const { density, isLoading } = getState();
    const actionIconProps = {
        ...parseFromValuesOrFunc(mantineExpandAllButtonProps, {
            table,
        }),
        ...rest,
    };
    const isAllRowsExpanded = getIsAllRowsExpanded();
    return (jsxRuntime.jsx(core.Tooltip, { label: (actionIconProps?.title ?? isAllRowsExpanded)
            ? localization.collapseAll
            : localization.expandAll, openDelay: 1000, withinPortal: true, children: jsxRuntime.jsx(core.ActionIcon, { "aria-label": localization.expandAll, color: "gray", variant: "subtle", ...actionIconProps, className: clsx("mrt-expand-all-button", classes$t.root, actionIconProps?.className, density), disabled: isLoading || (!renderDetailPanel && !getCanSomeRowsExpand()), onClick: () => toggleAllRowsExpanded(!isAllRowsExpanded), title: undefined, children: actionIconProps?.children ?? (jsxRuntime.jsx(IconChevronsDown, { className: clsx(classes$t.chevron, isAllRowsExpanded
                    ? classes$t.up
                    : getIsSomeRowsExpanded()
                        ? classes$t.right
                        : undefined) })) }) }));
};

const getColumnId = (columnDef) => columnDef.id ?? columnDef.accessorKey?.toString?.() ?? columnDef.header;
const getAllLeafColumnDefs = (columns) => {
    const allLeafColumnDefs = [];
    const getLeafColumns = (cols) => {
        cols.forEach((col) => {
            if (col.columns) {
                getLeafColumns(col.columns);
            }
            else {
                allLeafColumnDefs.push(col);
            }
        });
    };
    getLeafColumns(columns);
    return allLeafColumnDefs;
};
const prepareColumns = ({ columnDefs, tableOptions, }) => {
    const { aggregationFns = {}, defaultDisplayColumn, filterFns = {}, sortingFns = {}, state: { columnFilterFns = {} } = {}, } = tableOptions;
    return columnDefs.map((columnDef) => {
        //assign columnId
        if (!columnDef.id)
            columnDef.id = getColumnId(columnDef);
        //assign columnDefType
        if (!columnDef.columnDefType)
            columnDef.columnDefType = "data";
        if (columnDef.columns?.length) {
            columnDef.columnDefType = "group";
            //recursively prepare columns if this is a group column
            columnDef.columns = prepareColumns({
                columnDefs: columnDef.columns,
                tableOptions,
            });
        }
        else if (columnDef.columnDefType === "data") {
            //assign aggregationFns if multiple aggregationFns are provided
            if (Array.isArray(columnDef.aggregationFn)) {
                const aggFns = columnDef.aggregationFn;
                columnDef.aggregationFn = (columnId, leafRows, childRows) => aggFns.map((fn) => aggregationFns[fn]?.(columnId, leafRows, childRows));
            }
            //assign filterFns
            if (Object.keys(filterFns).includes(columnFilterFns[columnDef.id])) {
                columnDef.filterFn =
                    filterFns[columnFilterFns[columnDef.id]] ?? filterFns.fuzzy;
                columnDef._filterFn =
                    columnFilterFns[columnDef.id];
            }
            //assign sortingFns
            if (Object.keys(sortingFns).includes(columnDef.sortingFn)) {
                // @ts-expect-error
                columnDef.sortingFn = sortingFns[columnDef.sortingFn];
            }
        }
        else if (columnDef.columnDefType === "display") {
            columnDef = {
                ...defaultDisplayColumn,
                ...columnDef,
            };
        }
        return columnDef;
    });
};
const reorderColumn = (draggedColumn, targetColumn, columnOrder) => {
    if (draggedColumn.getCanPin()) {
        draggedColumn.pin(targetColumn.getIsPinned());
    }
    const newColumnOrder = [...columnOrder];
    newColumnOrder.splice(newColumnOrder.indexOf(targetColumn.id), 0, newColumnOrder.splice(newColumnOrder.indexOf(draggedColumn.id), 1)[0]);
    return newColumnOrder;
};
const getDefaultColumnFilterFn = (columnDef) => {
    const { filterVariant } = columnDef;
    if (filterVariant === "multi-select")
        return "arrIncludesSome";
    if (filterVariant?.includes("range"))
        return "betweenInclusive";
    if (["checkbox", "date", "select"].includes(filterVariant || ""))
        return "equals";
    return "fuzzy";
};

function defaultDisplayColumnProps({ header, id, size, tableOptions, }) {
    const { defaultDisplayColumn, displayColumnDefOptions, localization } = tableOptions;
    return {
        ...defaultDisplayColumn,
        header: header ? localization[header] : "",
        size,
        ...displayColumnDefOptions?.[id],
        id,
    };
}
const showRowPinningColumn = (tableOptions) => {
    const { enableRowPinning, rowPinningDisplayMode } = tableOptions;
    return !!(enableRowPinning && !rowPinningDisplayMode?.startsWith("select"));
};
const showRowDragColumn = (tableOptions) => {
    const { enableRowDragging, enableRowOrdering } = tableOptions;
    return !!(enableRowDragging || enableRowOrdering);
};
const showRowExpandColumn = (tableOptions) => {
    const { enableExpanding, enableGrouping, renderDetailPanel, state: { grouping }, } = tableOptions;
    return !!(enableExpanding ||
        (enableGrouping && grouping?.length) ||
        renderDetailPanel);
};
const showRowActionsColumn = (tableOptions) => {
    const { createDisplayMode, editDisplayMode, enableEditing, enableRowActions, state: { creatingRow }, } = tableOptions;
    return !!(enableRowActions ||
        (creatingRow && createDisplayMode === "row") ||
        (enableEditing && ["modal", "row"].includes(editDisplayMode ?? "")));
};
const showRowSelectionColumn = (tableOptions) => !!tableOptions.enableRowSelection;
const showRowNumbersColumn = (tableOptions) => !!tableOptions.enableRowNumbers;
const showRowSpacerColumn = (tableOptions) => tableOptions.layoutMode === "grid-no-grow";
const getLeadingDisplayColumnIds = (tableOptions) => [
    showRowPinningColumn(tableOptions) && "mrt-row-pin",
    showRowDragColumn(tableOptions) && "mrt-row-drag",
    tableOptions.positionActionsColumn === "first" &&
        showRowActionsColumn(tableOptions) &&
        "mrt-row-actions",
    tableOptions.positionExpandColumn === "first" &&
        showRowExpandColumn(tableOptions) &&
        "mrt-row-expand",
    showRowSelectionColumn(tableOptions) && "mrt-row-select",
    showRowNumbersColumn(tableOptions) && "mrt-row-numbers",
].filter(Boolean);
const getTrailingDisplayColumnIds = (tableOptions) => [
    tableOptions.positionActionsColumn === "last" &&
        showRowActionsColumn(tableOptions) &&
        "mrt-row-actions",
    tableOptions.positionExpandColumn === "last" &&
        showRowExpandColumn(tableOptions) &&
        "mrt-row-expand",
    showRowSpacerColumn(tableOptions) && "mrt-row-spacer",
].filter(Boolean);
const getDefaultColumnOrderIds = (tableOptions, reset = false) => {
    const { state: { columnOrder: currentColumnOrderIds = [] }, } = tableOptions;
    const leadingDisplayColIds = getLeadingDisplayColumnIds(tableOptions);
    const trailingDisplayColIds = getTrailingDisplayColumnIds(tableOptions);
    const defaultColumnDefIds = getAllLeafColumnDefs(tableOptions.columns).map((columnDef) => getColumnId(columnDef));
    let allLeafColumnDefIds = reset
        ? defaultColumnDefIds
        : Array.from(new Set([...currentColumnOrderIds, ...defaultColumnDefIds]));
    allLeafColumnDefIds = allLeafColumnDefIds.filter((colId) => !leadingDisplayColIds.includes(colId) &&
        !trailingDisplayColIds.includes(colId));
    return [
        ...leadingDisplayColIds,
        ...allLeafColumnDefIds,
        ...trailingDisplayColIds,
    ];
};

var classes$s = {"root":"MRT_ShowHideColumnsMenu-module_root__2UWak","content":"MRT_ShowHideColumnsMenu-module_content__ehkWQ"};

var classes$r = {"root":"MRT_ShowHideColumnsMenuItems-module_root__wYgv-","menu":"MRT_ShowHideColumnsMenuItems-module_menu__CeATR","grab":"MRT_ShowHideColumnsMenuItems-module_grab__a-d-y","pin":"MRT_ShowHideColumnsMenuItems-module_pin__P437b","switch":"MRT_ShowHideColumnsMenuItems-module_switch__tMsdt","header":"MRT_ShowHideColumnsMenuItems-module_header__xVkKb"};

const MRT_ShowHideColumnsMenuItems = ({ allColumns, column, hoveredColumn, setHoveredColumn, table, }) => {
    const theme = core.useMantineTheme();
    const { getState, options: { enableColumnOrdering, enableColumnPinning, enableHiding, localization, }, setColumnOrder, } = table;
    const { columnOrder } = getState();
    const { columnDef } = column;
    const { columnDefType } = columnDef;
    const switchChecked = (columnDefType !== "group" && column.getIsVisible()) ||
        (columnDefType === "group" &&
            column.getLeafColumns().some((col) => col.getIsVisible()));
    const handleToggleColumnHidden = (column) => {
        if (columnDefType === "group") {
            column?.columns?.forEach?.((childColumn) => {
                childColumn.toggleVisibility(!switchChecked);
            });
        }
        else {
            column.toggleVisibility();
        }
    };
    const menuItemRef = react.useRef(null);
    const [isDragging, setIsDragging] = react.useState(false);
    const handleDragStart = (e) => {
        setIsDragging(true);
        e.dataTransfer.setDragImage(menuItemRef.current, 0, 0);
    };
    const handleDragEnd = (_e) => {
        setIsDragging(false);
        setHoveredColumn(null);
        if (hoveredColumn) {
            setColumnOrder(reorderColumn(column, hoveredColumn, columnOrder));
        }
    };
    const handleDragEnter = (_e) => {
        if (!isDragging && columnDef.enableColumnOrdering !== false) {
            setHoveredColumn(column);
        }
    };
    if (!columnDef.header || columnDef.visibleInShowHideMenu === false) {
        return null;
    }
    return (jsxRuntime.jsxs(jsxRuntime.Fragment, { children: [jsxRuntime.jsx(core.Menu.Item, { className: classes$r.root, component: "span", onDragEnter: handleDragEnter, ref: menuItemRef, style: {
                    "--_column-depth": `${(column.depth + 0.5) * 2}rem`,
                    "--_hover-color": getPrimaryColor(theme),
                }, ...dataVariable("dragging", isDragging), ...dataVariable("order-hovered", hoveredColumn?.id === column.id), children: jsxRuntime.jsxs(core.Box, { className: classes$r.menu, children: [columnDefType !== "group" &&
                            enableColumnOrdering &&
                            !allColumns.some((col) => col.columnDef.columnDefType === "group") &&
                            (columnDef.enableColumnOrdering !== false ? (jsxRuntime.jsx(MRT_GrabHandleButton, { onDragEnd: handleDragEnd, onDragStart: handleDragStart, table: table })) : (jsxRuntime.jsx(core.Box, { className: classes$r.grab }))), enableColumnPinning &&
                            (column.getCanPin() ? (jsxRuntime.jsx(MRT_ColumnPinningButtons, { column: column, table: table })) : (jsxRuntime.jsx(core.Box, { className: classes$r.pin }))), enableHiding ? (jsxRuntime.jsx(core.Tooltip, { label: localization.toggleVisibility, openDelay: 1000, withinPortal: true, children: jsxRuntime.jsx(core.Switch, { checked: switchChecked, className: classes$r.switch, disabled: !column.getCanHide(), label: columnDef.header, onChange: () => handleToggleColumnHidden(column) }) })) : (jsxRuntime.jsx(core.Text, { className: classes$r.header, children: columnDef.header }))] }) }), column.columns?.map((c, i) => (jsxRuntime.jsx(MRT_ShowHideColumnsMenuItems, { allColumns: allColumns, column: c, hoveredColumn: hoveredColumn, setHoveredColumn: setHoveredColumn, table: table }, `${i}-${c.id}`)))] }));
};

const MRT_ShowHideColumnsMenu = ({ table, }) => {
    const { getAllColumns, getAllLeafColumns, getCenterLeafColumns, getIsAllColumnsVisible, getIsSomeColumnsPinned, getIsSomeColumnsVisible, getLeftLeafColumns, getRightLeafColumns, getState, options: { enableColumnOrdering, enableColumnPinning, enableHiding, localization, }, } = table;
    const { columnOrder, columnPinning } = getState();
    const handleToggleAllColumns = (value) => {
        getAllLeafColumns()
            .filter((col) => col.columnDef.enableHiding !== false)
            .forEach((col) => col.toggleVisibility(value));
    };
    const allColumns = react.useMemo(() => {
        const columns = getAllColumns();
        if (columnOrder.length > 0 &&
            !columns.some((col) => col.columnDef.columnDefType === "group")) {
            return [
                ...getLeftLeafColumns(),
                ...Array.from(new Set(columnOrder)).map((colId) => getCenterLeafColumns().find((col) => col?.id === colId)),
                ...getRightLeafColumns(),
            ].filter(Boolean);
        }
        return columns;
    }, [
        columnOrder,
        columnPinning,
        getAllColumns(),
        getCenterLeafColumns(),
        getLeftLeafColumns(),
        getRightLeafColumns(),
    ]);
    const [hoveredColumn, setHoveredColumn] = react.useState(null);
    return (jsxRuntime.jsxs(core.Menu.Dropdown, { className: clsx("mrt-show-hide-columns-menu", classes$s.root), children: [jsxRuntime.jsxs(core.Flex, { className: classes$s.content, children: [enableHiding && (jsxRuntime.jsx(core.Button, { disabled: !getIsSomeColumnsVisible(), onClick: () => handleToggleAllColumns(false), variant: "subtle", children: localization.hideAll })), enableColumnOrdering && (jsxRuntime.jsx(core.Button, { onClick: () => table.setColumnOrder(getDefaultColumnOrderIds(table.options, true)), variant: "subtle", children: localization.resetOrder })), enableColumnPinning && (jsxRuntime.jsx(core.Button, { disabled: !getIsSomeColumnsPinned(), onClick: () => table.resetColumnPinning(true), variant: "subtle", children: localization.unpinAll })), enableHiding && (jsxRuntime.jsx(core.Button, { disabled: getIsAllColumnsVisible(), onClick: () => handleToggleAllColumns(true), variant: "subtle", children: localization.showAll }))] }), jsxRuntime.jsx(core.Menu.Divider, {}), allColumns.map((column, index) => (jsxRuntime.jsx(MRT_ShowHideColumnsMenuItems, { allColumns: allColumns, column: column, hoveredColumn: hoveredColumn, setHoveredColumn: setHoveredColumn, table: table }, `${index}-${column.id}`)))] }));
};

const MRT_ShowHideColumnsButton = ({ table, title, ...rest }) => {
    const { icons: { IconColumns }, localization: { showHideColumns }, } = table.options;
    return (jsxRuntime.jsxs(core.Menu, { closeOnItemClick: false, withinPortal: true, children: [jsxRuntime.jsx(core.Tooltip, { label: title ?? showHideColumns, withinPortal: true, children: jsxRuntime.jsx(core.Menu.Target, { children: jsxRuntime.jsx(core.ActionIcon, { "aria-label": title ?? showHideColumns, color: "gray", size: "lg", variant: "subtle", ...rest, children: jsxRuntime.jsx(IconColumns, {}) }) }) }), jsxRuntime.jsx(MRT_ShowHideColumnsMenu, { table: table })] }));
};

const next = {
    md: "xs",
    xl: "md",
    xs: "xl",
};
const MRT_ToggleDensePaddingButton = ({ table: { getState, options: { icons: { IconBaselineDensityLarge, IconBaselineDensityMedium, IconBaselineDensitySmall, }, localization: { toggleDensity }, }, setDensity, }, title, ...rest }) => {
    const { density } = getState();
    return (jsxRuntime.jsx(core.Tooltip, { label: title ?? toggleDensity, withinPortal: true, children: jsxRuntime.jsx(core.ActionIcon, { "aria-label": title ?? toggleDensity, color: "gray", onClick: () => setDensity((current) => next[current]), size: "lg", variant: "subtle", ...rest, children: density === "xs" ? (jsxRuntime.jsx(IconBaselineDensitySmall, {})) : density === "md" ? (jsxRuntime.jsx(IconBaselineDensityMedium, {})) : (jsxRuntime.jsx(IconBaselineDensityLarge, {})) }) }));
};

const MRT_ToggleFiltersButton = ({ table: { getState, options: { icons: { IconFilter, IconFilterOff }, localization: { showHideFilters }, }, setShowColumnFilters, }, title, ...rest }) => {
    const { showColumnFilters } = getState();
    return (jsxRuntime.jsx(core.Tooltip, { label: title ?? showHideFilters, withinPortal: true, children: jsxRuntime.jsx(core.ActionIcon, { "aria-label": title ?? showHideFilters, color: "gray", onClick: () => setShowColumnFilters((current) => !current), size: "lg", variant: "subtle", ...rest, children: showColumnFilters ? jsxRuntime.jsx(IconFilterOff, {}) : jsxRuntime.jsx(IconFilter, {}) }) }));
};

const MRT_ToggleFullScreenButton = ({ table: { getState, options: { icons: { IconMaximize, IconMinimize }, localization: { toggleFullScreen }, }, setIsFullScreen, }, title, ...rest }) => {
    const { isFullScreen } = getState();
    const [tooltipOpened, setTooltipOpened] = react.useState(false);
    const handleToggleFullScreen = () => {
        setTooltipOpened(false);
        setIsFullScreen((current) => !current);
    };
    return (jsxRuntime.jsx(core.Tooltip, { label: title ?? toggleFullScreen, opened: tooltipOpened, withinPortal: true, children: jsxRuntime.jsx(core.ActionIcon, { "aria-label": title ?? toggleFullScreen, color: "gray", onClick: handleToggleFullScreen, onMouseEnter: () => setTooltipOpened(true), onMouseLeave: () => setTooltipOpened(false), size: "lg", variant: "subtle", ...rest, children: isFullScreen ? jsxRuntime.jsx(IconMinimize, {}) : jsxRuntime.jsx(IconMaximize, {}) }) }));
};

const MRT_ToggleGlobalFilterButton = ({ table: { getState, options: { icons: { IconSearch, IconSearchOff }, localization: { showHideSearch }, }, refs: { searchInputRef }, setShowGlobalFilter, }, title, ...rest }) => {
    const { globalFilter, showGlobalFilter } = getState();
    const handleToggleSearch = () => {
        setShowGlobalFilter(!showGlobalFilter);
        setTimeout(() => searchInputRef.current?.focus(), 100);
    };
    return (jsxRuntime.jsx(core.Tooltip, { label: title ?? showHideSearch, withinPortal: true, children: jsxRuntime.jsx(core.ActionIcon, { "aria-label": title ?? showHideSearch, color: "gray", disabled: !!globalFilter, onClick: handleToggleSearch, size: "lg", variant: "subtle", ...rest, children: showGlobalFilter ? jsxRuntime.jsx(IconSearchOff, {}) : jsxRuntime.jsx(IconSearch, {}) }) }));
};

const MRT_RowActionMenu = ({ handleEdit, row, table, ...rest }) => {
    const { options: { editDisplayMode, enableEditing, icons: { IconDots, IconEdit }, localization, positionActionsColumn, renderRowActionMenuItems, }, } = table;
    return (jsxRuntime.jsxs(core.Menu, { closeOnItemClick: true, position: positionActionsColumn === "first"
            ? "bottom-start"
            : positionActionsColumn === "last"
                ? "bottom-end"
                : undefined, withinPortal: true, children: [jsxRuntime.jsx(core.Tooltip, { label: localization.rowActions, openDelay: 1000, withinPortal: true, children: jsxRuntime.jsx(core.Menu.Target, { children: jsxRuntime.jsx(core.ActionIcon, { "aria-label": localization.rowActions, color: "gray", onClick: (event) => event.stopPropagation(), size: "sm", variant: "subtle", ...rest, children: jsxRuntime.jsx(IconDots, {}) }) }) }), jsxRuntime.jsxs(core.Menu.Dropdown, { onClick: (event) => event.stopPropagation(), children: [enableEditing && editDisplayMode !== "table" && (jsxRuntime.jsx(core.Menu.Item, { leftSection: jsxRuntime.jsx(IconEdit, {}), onClick: handleEdit, children: localization.edit })), renderRowActionMenuItems?.({
                        row,
                        table,
                    })] })] }));
};

const MRT_ToggleRowActionMenuButton = ({ cell, row, table, }) => {
    const { getState, options: { createDisplayMode, editDisplayMode, enableEditing, icons: { IconEdit }, localization: { edit }, renderRowActionMenuItems, renderRowActions, }, setEditingRow, } = table;
    const { creatingRow, editingRow } = getState();
    const isCreating = creatingRow?.id === row.id;
    const isEditing = editingRow?.id === row.id;
    const handleStartEditMode = (event) => {
        event.stopPropagation();
        setEditingRow({ ...row });
    };
    const showEditActionButtons = (isCreating && createDisplayMode === "row") ||
        (isEditing && editDisplayMode === "row");
    return (jsxRuntime.jsx(jsxRuntime.Fragment, { children: renderRowActions && !showEditActionButtons ? (renderRowActions({ cell, row, table })) : showEditActionButtons ? (jsxRuntime.jsx(MRT_EditActionButtons, { row: row, table: table })) : !renderRowActionMenuItems &&
            parseFromValuesOrFunc(enableEditing, row) ? (jsxRuntime.jsx(core.Tooltip, { label: edit, openDelay: 1000, position: "right", withinPortal: true, children: jsxRuntime.jsx(core.ActionIcon, { "aria-label": edit, color: "gray", disabled: !!editingRow && editingRow.id !== row.id, onClick: handleStartEditMode, size: "md", variant: "subtle", children: jsxRuntime.jsx(IconEdit, {}) }) })) : renderRowActionMenuItems ? (jsxRuntime.jsx(MRT_RowActionMenu, { handleEdit: handleStartEditMode, row: row, table: table })) : null }));
};

var classes$q = {"root":"MRT_TableFooter-module_root__-JXpw","grid":"MRT_TableFooter-module_grid__J3Ga-","sticky":"MRT_TableFooter-module_sticky__GcoK6"};

var classes$p = {"root":"MRT_TableFooterCell-module_root__d8Scs","grid":"MRT_TableFooterCell-module_grid__H9jLk","group":"MRT_TableFooterCell-module_group__l3-p-"};

const MRT_TableFooterCell = ({ footer, renderedColumnIndex, table, ...rest }) => {
    const direction = core.useDirection();
    const { options: { enableColumnPinning, layoutMode, mantineTableFooterCellProps }, } = table;
    const { column } = footer;
    const { columnDef } = column;
    const { columnDefType } = columnDef;
    const isColumnPinned = enableColumnPinning &&
        columnDef.columnDefType !== "group" &&
        column.getIsPinned();
    const args = { column, table };
    const tableCellProps = {
        ...parseFromValuesOrFunc(mantineTableFooterCellProps, args),
        ...parseFromValuesOrFunc(columnDef.mantineTableFooterCellProps, args),
        ...rest,
    };
    const widthStyles = {
        minWidth: `max(calc(var(--header-${parseCSSVarId(footer?.id)}-size) * 1px), ${columnDef.minSize ?? 30}px)`,
        width: `calc(var(--header-${parseCSSVarId(footer.id)}-size) * 1px)`,
    };
    if (layoutMode === "grid") {
        widthStyles.flex = `${[0, false].includes(columnDef.grow)
            ? 0
            : `var(--header-${parseCSSVarId(footer.id)}-size)`} 0 auto`;
    }
    else if (layoutMode === "grid-no-grow") {
        widthStyles.flex = `${+(columnDef.grow || 0)} 0 auto`;
    }
    return (jsxRuntime.jsx(core.TableTh, { colSpan: footer.colSpan, "data-column-pinned": isColumnPinned || undefined, "data-first-right-pinned": (isColumnPinned === "right" &&
            column.getIsFirstColumn(isColumnPinned)) ||
            undefined, "data-index": renderedColumnIndex, "data-last-left-pinned": (isColumnPinned === "left" && column.getIsLastColumn(isColumnPinned)) ||
            undefined, ...tableCellProps, __vars: {
            "--mrt-cell-align": tableCellProps.align ??
                (columnDefType === "group"
                    ? "center"
                    : direction.dir === "rtl"
                        ? "right"
                        : "left"),
            "--mrt-table-cell-left": isColumnPinned === "left"
                ? `${column.getStart(isColumnPinned)}`
                : undefined,
            "--mrt-table-cell-right": isColumnPinned === "right"
                ? `${column.getAfter(isColumnPinned)}`
                : undefined,
            ...tableCellProps?.__vars,
        }, className: clsx(classes$p.root, layoutMode?.startsWith("grid") && classes$p.grid, columnDefType === "group" && classes$p.group, tableCellProps?.className), style: (theme) => ({
            ...widthStyles,
            ...parseFromValuesOrFunc(tableCellProps.style, theme),
        }), children: tableCellProps.children ??
            (footer.isPlaceholder
                ? null
                : (parseFromValuesOrFunc(columnDef.Footer, {
                    column,
                    footer,
                    table,
                }) ??
                    columnDef.footer ??
                    null)) }));
};

var classes$o = {"root":"MRT_TableFooterRow-module_root__EuoPr","layout-mode-grid":"MRT_TableFooterRow-module_layout-mode-grid__dUEMF"};

const MRT_TableFooterRow = ({ columnVirtualizer, footerGroup, table, ...rest }) => {
    const { options: { layoutMode, mantineTableFooterRowProps }, } = table;
    const { virtualColumns, virtualPaddingLeft, virtualPaddingRight } = columnVirtualizer ?? {};
    // if no content in row, skip row
    if (!footerGroup.headers?.some((header) => (typeof header.column.columnDef.footer === "string" &&
        !!header.column.columnDef.footer) ||
        header.column.columnDef.Footer)) {
        return null;
    }
    const tableRowProps = {
        ...parseFromValuesOrFunc(mantineTableFooterRowProps, {
            footerGroup,
            table,
        }),
        ...rest,
    };
    return (jsxRuntime.jsxs(core.TableTr, { className: clsx(classes$o.root, layoutMode?.startsWith("grid") && classes$o["layout-mode-grid"]), ...tableRowProps, children: [virtualPaddingLeft ? (jsxRuntime.jsx(core.Box, { component: "th", display: "flex", w: virtualPaddingLeft })) : null, (virtualColumns ?? footerGroup.headers).map((footerOrVirtualFooter, renderedColumnIndex) => {
                let footer = footerOrVirtualFooter;
                if (columnVirtualizer) {
                    renderedColumnIndex = footerOrVirtualFooter
                        .index;
                    footer = footerGroup.headers[renderedColumnIndex];
                }
                return (jsxRuntime.jsx(MRT_TableFooterCell, { footer: footer, renderedColumnIndex: renderedColumnIndex, table: table }, footer.id));
            }), virtualPaddingRight ? (jsxRuntime.jsx(core.Box, { component: "th", display: "flex", w: virtualPaddingRight })) : null] }));
};

const MRT_TableFooter = ({ columnVirtualizer, table, ...rest }) => {
    const { getFooterGroups, getState, options: { enableStickyFooter, layoutMode, mantineTableFooterProps }, refs: { tableFooterRef }, } = table;
    const { isFullScreen } = getState();
    const tableFooterProps = {
        ...parseFromValuesOrFunc(mantineTableFooterProps, {
            table,
        }),
        ...rest,
    };
    const stickFooter = (isFullScreen || enableStickyFooter) && enableStickyFooter !== false;
    return (jsxRuntime.jsx(core.TableTfoot, { ...tableFooterProps, className: clsx(classes$q.root, tableFooterProps?.className, stickFooter && classes$q.sticky, layoutMode?.startsWith("grid") && classes$q.grid), ref: (ref) => {
            tableFooterRef.current = ref;
            if (tableFooterProps?.ref) {
                tableFooterProps.ref.current = ref;
            }
        }, children: getFooterGroups().map((footerGroup) => (jsxRuntime.jsx(MRT_TableFooterRow, { columnVirtualizer: columnVirtualizer, footerGroup: footerGroup, table: table }, footerGroup.id))) }));
};

const MRT_SelectCheckbox = ({ renderedRowIndex = 0, row, table, ...rest }) => {
    const { getState, options: { enableMultiRowSelection, localization, mantineSelectAllCheckboxProps, mantineSelectCheckboxProps, selectAllMode, selectDisplayMode, }, } = table;
    const { density, isLoading } = getState();
    const selectAll = !row;
    const allRowsSelected = selectAll
        ? selectAllMode === "page"
            ? table.getIsAllPageRowsSelected()
            : table.getIsAllRowsSelected()
        : undefined;
    const isChecked = selectAll
        ? allRowsSelected
        : getIsRowSelected({ row, table });
    const checkboxProps = {
        ...(selectAll
            ? parseFromValuesOrFunc(mantineSelectAllCheckboxProps, { table })
            : parseFromValuesOrFunc(mantineSelectCheckboxProps, {
                row,
                table,
            })),
        ...rest,
    };
    const onSelectionChange = row
        ? getMRT_RowSelectionHandler({
            renderedRowIndex,
            row,
            table,
        })
        : undefined;
    const onSelectAllChange = getMRT_SelectAllHandler({ table });
    const commonProps = {
        "aria-label": selectAll
            ? localization.toggleSelectAll
            : localization.toggleSelectRow,
        checked: isChecked,
        disabled: isLoading || (row && !row.getCanSelect()) || row?.id === "mrt-row-create",
        onChange: (event) => {
            event.stopPropagation();
            if (selectAll) {
                onSelectAllChange(event);
            }
            else {
                onSelectionChange(event);
            }
        },
        size: density === "xs" ? "sm" : "md",
        ...checkboxProps,
        onClick: (e) => {
            e.stopPropagation();
            checkboxProps?.onClick?.(e);
        },
        title: undefined,
    };
    return (jsxRuntime.jsx(core.Tooltip, { label: checkboxProps?.title ??
            (selectAll
                ? localization.toggleSelectAll
                : localization.toggleSelectRow), openDelay: 1000, withinPortal: true, children: jsxRuntime.jsx("span", { children: selectDisplayMode === "switch" ? (jsxRuntime.jsx(core.Switch, { ...commonProps })) : selectDisplayMode === "radio" ||
                enableMultiRowSelection === false ? (jsxRuntime.jsx(core.Radio, { ...commonProps })) : (jsxRuntime.jsx(core.Checkbox, { indeterminate: !isChecked && selectAll
                    ? table.getIsSomeRowsSelected()
                    : row?.getIsSomeSelected() && row.getCanSelectSubRows(), ...commonProps })) }) }));
};

var classes$n = {"alert":"MRT_ToolbarAlertBanner-module_alert__PAhUK","alert-stacked":"MRT_ToolbarAlertBanner-module_alert-stacked__HR7Nq","alert-bottom":"MRT_ToolbarAlertBanner-module_alert-bottom__u9L-S","alert-badge":"MRT_ToolbarAlertBanner-module_alert-badge__GwDmX","toolbar-alert":"MRT_ToolbarAlertBanner-module_toolbar-alert__3sJGU","head-overlay":"MRT_ToolbarAlertBanner-module_head-overlay__Hw7jK"};

const MRT_ToolbarAlertBanner = ({ stackAlertBanner, table, ...rest }) => {
    const { getFilteredSelectedRowModel, getPrePaginationRowModel, getState, options: { enableRowSelection, enableSelectAll, icons: { IconX }, localization, mantineToolbarAlertBannerBadgeProps, mantineToolbarAlertBannerProps, manualPagination, positionToolbarAlertBanner, renderToolbarAlertBannerContent, rowCount, }, } = table;
    const { density, grouping, rowSelection, showAlertBanner } = getState();
    const alertProps = {
        ...parseFromValuesOrFunc(mantineToolbarAlertBannerProps, {
            table,
        }),
        ...rest,
    };
    const badgeProps = parseFromValuesOrFunc(mantineToolbarAlertBannerBadgeProps, { table });
    const totalRowCount = rowCount ?? getPrePaginationRowModel().flatRows.length;
    const selectedRowCount = react.useMemo(() => manualPagination
        ? Object.values(rowSelection).filter(Boolean).length
        : getFilteredSelectedRowModel().rows.length, [rowSelection, totalRowCount, manualPagination]);
    const selectedAlert = selectedRowCount ? (jsxRuntime.jsxs(core.Flex, { align: "center", gap: "sm", children: [localization.selectedCountOfRowCountRowsSelected
                ?.replace("{selectedCount}", selectedRowCount.toString())
                ?.replace("{rowCount}", totalRowCount.toString()), jsxRuntime.jsx(core.Button, { onClick: (event) => getMRT_SelectAllHandler({ table })(event, false, true), size: "compact-xs", variant: "subtle", children: localization.clearSelection })] })) : null;
    const groupedAlert = grouping.length > 0 ? (jsxRuntime.jsxs(core.Flex, { children: [localization.groupedBy, " ", grouping.map((columnId, index) => (jsxRuntime.jsxs(react.Fragment, { children: [index > 0 ? localization.thenBy : "", jsxRuntime.jsxs(core.Badge, { className: classes$n["alert-badge"], rightSection: jsxRuntime.jsx(core.ActionIcon, { color: "white", onClick: () => table.getColumn(columnId).toggleGrouping(), size: "xs", variant: "subtle", children: jsxRuntime.jsx(IconX, { style: { transform: "scale(0.8)" } }) }), variant: "filled", ...badgeProps, children: [table.getColumn(columnId).columnDef.header, " "] })] }, `${index}-${columnId}`)))] })) : null;
    return (jsxRuntime.jsx(core.Collapse, { in: showAlertBanner || !!selectedAlert || !!groupedAlert, transitionDuration: stackAlertBanner ? 200 : 0, children: jsxRuntime.jsx(core.Alert, { color: "blue", icon: false, ...alertProps, className: clsx(classes$n.alert, stackAlertBanner &&
                !positionToolbarAlertBanner &&
                classes$n["alert-stacked"], !stackAlertBanner &&
                positionToolbarAlertBanner === "bottom" &&
                classes$n["alert-bottom"], alertProps?.className), children: renderToolbarAlertBannerContent?.({
                groupedAlert,
                selectedAlert,
                table,
            }) ?? (jsxRuntime.jsxs(core.Flex, { className: clsx(classes$n["toolbar-alert"], positionToolbarAlertBanner === "head-overlay" &&
                    classes$n["head-overlay"], density), children: [enableRowSelection &&
                        enableSelectAll &&
                        positionToolbarAlertBanner === "head-overlay" && (jsxRuntime.jsx(MRT_SelectCheckbox, { table: table })), jsxRuntime.jsxs(core.Stack, { children: [alertProps?.children, selectedAlert, groupedAlert] })] })) }) }));
};

var classes$m = {"root":"MRT_TableHead-module_root__j9NkO","root-grid":"MRT_TableHead-module_root-grid__c3aGl","root-table-row-group":"MRT_TableHead-module_root-table-row-group__d9FO4","root-sticky":"MRT_TableHead-module_root-sticky__0kuDE","banner-tr":"MRT_TableHead-module_banner-tr__EhT-x","banner-th":"MRT_TableHead-module_banner-th__KwM5a","grid":"MRT_TableHead-module_grid__OJ-td"};

var classes$l = {"left":"MRT_ColumnActionMenu-module_left__cfNmY","right":"MRT_ColumnActionMenu-module_right__-nK56"};

const MRT_ColumnActionMenu = ({ header, table, ...rest }) => {
    const { getState, options: { columnFilterDisplayMode, enableColumnFilters, enableColumnPinning, enableColumnResizing, enableGrouping, enableHiding, enableSorting, enableSortingRemoval, icons: { IconArrowAutofitContent, IconBoxMultiple, IconClearAll, IconColumns, IconDotsVertical, IconEyeOff, IconFilter, IconFilterOff, IconPinned, IconPinnedOff, IconSortAscending, IconSortDescending, }, localization, mantineColumnActionsButtonProps, renderColumnActionsMenuItems, }, refs: { filterInputRefs }, setColumnOrder, setColumnSizingInfo, setShowColumnFilters, toggleAllColumnsVisible, } = table;
    const { column } = header;
    const { columnDef } = column;
    const { columnSizing, columnVisibility } = getState();
    const arg = { column, table };
    const actionIconProps = {
        ...parseFromValuesOrFunc(mantineColumnActionsButtonProps, arg),
        ...parseFromValuesOrFunc(columnDef.mantineColumnActionsButtonProps, arg),
    };
    const handleClearSort = () => {
        column.clearSorting();
    };
    const handleSortAsc = () => {
        column.toggleSorting(false);
    };
    const handleSortDesc = () => {
        column.toggleSorting(true);
    };
    const handleResetColumnSize = () => {
        setColumnSizingInfo((old) => ({ ...old, isResizingColumn: false }));
        column.resetSize();
    };
    const handleHideColumn = () => {
        column.toggleVisibility(false);
    };
    const handlePinColumn = (pinDirection) => {
        column.pin(pinDirection);
    };
    const handleGroupByColumn = () => {
        column.toggleGrouping();
        setColumnOrder((old) => ["mrt-row-expand", ...old]);
    };
    const handleClearFilter = () => {
        column.setFilterValue("");
    };
    const handleFilterByColumn = () => {
        setShowColumnFilters(true);
        setTimeout(() => filterInputRefs.current[`${column.id}-0`]?.focus(), 100);
    };
    const handleShowAllColumns = () => {
        toggleAllColumnsVisible(true);
    };
    const internalColumnMenuItems = (jsxRuntime.jsxs(jsxRuntime.Fragment, { children: [enableSorting && column.getCanSort() && (jsxRuntime.jsxs(jsxRuntime.Fragment, { children: [enableSortingRemoval !== false && (jsxRuntime.jsx(core.Menu.Item, { disabled: !column.getIsSorted(), leftSection: jsxRuntime.jsx(IconClearAll, {}), onClick: handleClearSort, children: localization.clearSort })), jsxRuntime.jsx(core.Menu.Item, { disabled: column.getIsSorted() === "asc", leftSection: jsxRuntime.jsx(IconSortAscending, {}), onClick: handleSortAsc, children: localization.sortByColumnAsc?.replace("{column}", String(columnDef.header)) }), jsxRuntime.jsx(core.Menu.Item, { disabled: column.getIsSorted() === "desc", leftSection: jsxRuntime.jsx(IconSortDescending, {}), onClick: handleSortDesc, children: localization.sortByColumnDesc?.replace("{column}", String(columnDef.header)) }), (enableColumnFilters || enableGrouping || enableHiding) && (jsxRuntime.jsx(core.Menu.Divider, {}, 3))] })), enableColumnFilters &&
                columnFilterDisplayMode !== "popover" &&
                column.getCanFilter() && (jsxRuntime.jsxs(jsxRuntime.Fragment, { children: [jsxRuntime.jsx(core.Menu.Item, { disabled: !column.getFilterValue(), leftSection: jsxRuntime.jsx(IconFilterOff, {}), onClick: handleClearFilter, children: localization.clearFilter }), jsxRuntime.jsx(core.Menu.Item, { leftSection: jsxRuntime.jsx(IconFilter, {}), onClick: handleFilterByColumn, children: localization.filterByColumn?.replace("{column}", String(columnDef.header)) }), (enableGrouping || enableHiding) && jsxRuntime.jsx(core.Menu.Divider, {}, 2)] })), enableGrouping && column.getCanGroup() && (jsxRuntime.jsxs(jsxRuntime.Fragment, { children: [jsxRuntime.jsx(core.Menu.Item, { leftSection: jsxRuntime.jsx(IconBoxMultiple, {}), onClick: handleGroupByColumn, children: localization[column.getIsGrouped() ? "ungroupByColumn" : "groupByColumn"]?.replace("{column}", String(columnDef.header)) }), enableColumnPinning && jsxRuntime.jsx(core.Menu.Divider, {})] })), enableColumnPinning && column.getCanPin() && (jsxRuntime.jsxs(jsxRuntime.Fragment, { children: [jsxRuntime.jsx(core.Menu.Item, { disabled: column.getIsPinned() === "left" || !column.getCanPin(), leftSection: jsxRuntime.jsx(IconPinned, { className: classes$l.left }), onClick: () => handlePinColumn("left"), children: localization.pinToLeft }), jsxRuntime.jsx(core.Menu.Item, { disabled: column.getIsPinned() === "right" || !column.getCanPin(), leftSection: jsxRuntime.jsx(IconPinned, { className: classes$l.right }), onClick: () => handlePinColumn("right"), children: localization.pinToRight }), jsxRuntime.jsx(core.Menu.Item, { disabled: !column.getIsPinned(), leftSection: jsxRuntime.jsx(IconPinnedOff, {}), onClick: () => handlePinColumn(false), children: localization.unpin }), enableHiding && jsxRuntime.jsx(core.Menu.Divider, {})] })), enableColumnResizing && column.getCanResize() && (jsxRuntime.jsx(core.Menu.Item, { disabled: !columnSizing[column.id], leftSection: jsxRuntime.jsx(IconArrowAutofitContent, {}), onClick: handleResetColumnSize, children: localization.resetColumnSize }, 0)), enableHiding && (jsxRuntime.jsxs(jsxRuntime.Fragment, { children: [jsxRuntime.jsx(core.Menu.Item, { disabled: !column.getCanHide(), leftSection: jsxRuntime.jsx(IconEyeOff, {}), onClick: handleHideColumn, children: localization.hideColumn?.replace("{column}", String(columnDef.header)) }, 0), jsxRuntime.jsx(core.Menu.Item, { disabled: !Object.values(columnVisibility).filter((visible) => !visible)
                            .length, leftSection: jsxRuntime.jsx(IconColumns, {}), onClick: handleShowAllColumns, children: localization.showAllColumns?.replace("{column}", String(columnDef.header)) }, 1)] }))] }));
    return (jsxRuntime.jsxs(core.Menu, { closeOnItemClick: true, position: "bottom-start", withinPortal: true, ...rest, children: [jsxRuntime.jsx(core.Tooltip, { label: actionIconProps?.title ?? localization.columnActions, openDelay: 1000, withinPortal: true, children: jsxRuntime.jsx(core.Menu.Target, { children: jsxRuntime.jsx(core.ActionIcon, { "aria-label": localization.columnActions, color: "gray", size: "sm", variant: "subtle", ...actionIconProps, children: jsxRuntime.jsx(IconDotsVertical, { size: "100%" }) }) }) }), jsxRuntime.jsx(core.Menu.Dropdown, { children: columnDef.renderColumnActionsMenuItems?.({
                    column,
                    internalColumnMenuItems,
                    table,
                }) ??
                    renderColumnActionsMenuItems?.({
                        column,
                        internalColumnMenuItems,
                        table,
                    }) ??
                    internalColumnMenuItems })] }));
};

var classes$k = {"root":"MRT_TableHeadCell-module_root__6y50a","root-grid":"MRT_TableHeadCell-module_root-grid__bAf1d","root-virtualized":"MRT_TableHeadCell-module_root-virtualized__CWLit","root-no-select":"MRT_TableHeadCell-module_root-no-select__BEOVU","content":"MRT_TableHeadCell-module_content__-pzSK","content-spaced":"MRT_TableHeadCell-module_content-spaced__S85Aa","content-center":"MRT_TableHeadCell-module_content-center__c-17L","content-right":"MRT_TableHeadCell-module_content-right__NSRZU","content-wrapper":"MRT_TableHeadCell-module_content-wrapper__py6aJ","content-wrapper-hidden-overflow":"MRT_TableHeadCell-module_content-wrapper-hidden-overflow__QY40r","content-wrapper-nowrap":"MRT_TableHeadCell-module_content-wrapper-nowrap__-4aIg","labels":"MRT_TableHeadCell-module_labels__oiMSr","labels-right":"MRT_TableHeadCell-module_labels-right__6ZJp-","labels-center":"MRT_TableHeadCell-module_labels-center__MM9q8","labels-sortable":"MRT_TableHeadCell-module_labels-sortable__tyuLr","labels-data":"MRT_TableHeadCell-module_labels-data__PvFGO","content-actions":"MRT_TableHeadCell-module_content-actions__utxbm"};

const fuzzy = (row, columnId, filterValue, addMeta) => {
    const itemRank = matchSorterUtils.rankItem(row.getValue(columnId), filterValue, {
        threshold: matchSorterUtils.rankings.MATCHES,
    });
    addMeta(itemRank);
    return itemRank.passed;
};
fuzzy.autoRemove = (val) => !val;
const contains = (row, id, filterValue) => row
    .getValue(id)
    ?.toString()
    .toLowerCase()
    .trim()
    .includes(filterValue.toString().toLowerCase().trim());
contains.autoRemove = (val) => !val;
const startsWith = (row, id, filterValue) => row
    .getValue(id)
    ?.toString()
    .toLowerCase()
    .trim()
    .startsWith(filterValue.toString().toLowerCase().trim());
startsWith.autoRemove = (val) => !val;
const endsWith = (row, id, filterValue) => row
    .getValue(id)
    ?.toString()
    .toLowerCase()
    .trim()
    .endsWith(filterValue.toString().toLowerCase().trim());
endsWith.autoRemove = (val) => !val;
const equals = (row, id, filterValue) => row.getValue(id)?.toString().toLowerCase().trim() ===
    filterValue?.toString().toLowerCase().trim();
equals.autoRemove = (val) => !val;
const notEquals = (row, id, filterValue) => row.getValue(id)?.toString().toLowerCase().trim() !==
    filterValue.toString().toLowerCase().trim();
notEquals.autoRemove = (val) => !val;
const greaterThan = (row, id, filterValue) => !isNaN(+filterValue) && !isNaN(+row.getValue(id))
    ? +row.getValue(id) > +filterValue
    : row.getValue(id)?.toString().toLowerCase().trim() >
        filterValue?.toString().toLowerCase().trim();
greaterThan.autoRemove = (val) => !val;
const greaterThanOrEqualTo = (row, id, filterValue) => equals(row, id, filterValue) || greaterThan(row, id, filterValue);
greaterThanOrEqualTo.autoRemove = (val) => !val;
const lessThan = (row, id, filterValue) => !isNaN(+filterValue) && !isNaN(+row.getValue(id))
    ? +row.getValue(id) < +filterValue
    : row.getValue(id)?.toString().toLowerCase().trim() <
        filterValue?.toString().toLowerCase().trim();
lessThan.autoRemove = (val) => !val;
const lessThanOrEqualTo = (row, id, filterValue) => equals(row, id, filterValue) || lessThan(row, id, filterValue);
lessThanOrEqualTo.autoRemove = (val) => !val;
const between = (row, id, filterValues) => (["", undefined].includes(filterValues[0]) ||
    greaterThan(row, id, filterValues[0])) &&
    ((!isNaN(+filterValues[0]) &&
        !isNaN(+filterValues[1]) &&
        +filterValues[0] > +filterValues[1]) ||
        ["", undefined].includes(filterValues[1]) ||
        lessThan(row, id, filterValues[1]));
between.autoRemove = (val) => !val;
const betweenInclusive = (row, id, filterValues) => (["", undefined].includes(filterValues[0]) ||
    greaterThanOrEqualTo(row, id, filterValues[0])) &&
    ((!isNaN(+filterValues[0]) &&
        !isNaN(+filterValues[1]) &&
        +filterValues[0] > +filterValues[1]) ||
        ["", undefined].includes(filterValues[1]) ||
        lessThanOrEqualTo(row, id, filterValues[1]));
betweenInclusive.autoRemove = (val) => !val;
const empty = (row, id, _filterValue) => !row.getValue(id)?.toString().trim();
empty.autoRemove = (val) => !val;
const notEmpty = (row, id, _filterValue) => !!row.getValue(id)?.toString().trim();
notEmpty.autoRemove = (val) => !val;
const MRT_FilterFns = {
    ...reactTable.filterFns,
    between,
    betweenInclusive,
    contains,
    empty,
    endsWith,
    equals,
    fuzzy,
    greaterThan,
    greaterThanOrEqualTo,
    lessThan,
    lessThanOrEqualTo,
    notEmpty,
    notEquals,
    startsWith,
};
function localizedFilterOption(localization, option) {
    if (!option) {
        return "";
    }
    const key = `filter${option[0].toUpperCase()}${option.slice(1)}`;
    return localization[key] ?? "";
}

var classes$j = {"root":"MRT_FilterCheckBox-module_root__59h9r"};

const MRT_FilterCheckbox = ({ column, table, ...rest }) => {
    const { getState, options: { localization, mantineFilterCheckboxProps }, } = table;
    const { density } = getState();
    const { columnDef } = column;
    const arg = { column, table };
    const checkboxProps = {
        ...parseFromValuesOrFunc(mantineFilterCheckboxProps, arg),
        ...parseFromValuesOrFunc(columnDef.mantineFilterCheckboxProps, arg),
        ...rest,
    };
    const filterLabel = localization.filterByColumn?.replace("{column}", columnDef.header);
    const value = column.getFilterValue();
    return (jsxRuntime.jsx(core.Tooltip, { label: checkboxProps?.title ?? filterLabel, openDelay: 1000, withinPortal: true, children: jsxRuntime.jsx(core.Checkbox, { checked: value === "true", className: clsx("mrt-filter-checkbox", classes$j.root), indeterminate: value === undefined, label: checkboxProps.title ?? filterLabel, size: density === "xs" ? "sm" : "md", ...checkboxProps, onChange: (e) => {
                column.setFilterValue(column.getFilterValue() === undefined
                    ? "true"
                    : column.getFilterValue() === "true"
                        ? "false"
                        : undefined);
                checkboxProps?.onChange?.(e);
            }, onClick: (e) => {
                e.stopPropagation();
                checkboxProps?.onClick?.(e);
            }, title: undefined }) }));
};

var classes$i = {"root":"MRT_FilterRangeFields-module_root__KfCcg"};

var classes$h = {"root":"MRT_FilterTextInput-module_root__Ss8Ql","date-filter":"MRT_FilterTextInput-module_date-filter__jOBLB","range-filter":"MRT_FilterTextInput-module_range-filter__JQHAL","not-filter-chip":"MRT_FilterTextInput-module_not-filter-chip__u8b1y","filter-chip-badge":"MRT_FilterTextInput-module_filter-chip-badge__Sel2k"};

const MRT_FilterTextInput = ({ header, rangeFilterIndex, table, ...rest }) => {
    const { options: { columnFilterDisplayMode, columnFilterModeOptions, icons: { IconX }, localization, mantineFilterAutocompleteProps, mantineFilterDateInputProps, mantineFilterMultiSelectProps = {
        clearable: true,
    }, mantineFilterSelectProps, mantineFilterTextInputProps, manualFiltering, }, refs: { filterInputRefs }, setColumnFilterFns, } = table;
    const { column } = header;
    const { columnDef } = column;
    const arg = { column, rangeFilterIndex, table };
    const textInputProps = {
        ...parseFromValuesOrFunc(mantineFilterTextInputProps, arg),
        ...parseFromValuesOrFunc(columnDef.mantineFilterTextInputProps, arg),
        ...rest,
    };
    const selectProps = {
        ...parseFromValuesOrFunc(mantineFilterSelectProps, arg),
        ...parseFromValuesOrFunc(columnDef.mantineFilterSelectProps, arg),
    };
    const multiSelectProps = {
        ...parseFromValuesOrFunc(mantineFilterMultiSelectProps, arg),
        ...parseFromValuesOrFunc(columnDef.mantineFilterMultiSelectProps, arg),
    };
    const dateInputProps = {
        ...parseFromValuesOrFunc(mantineFilterDateInputProps, arg),
        ...parseFromValuesOrFunc(columnDef.mantineFilterDateInputProps, arg),
    };
    const autoCompleteProps = {
        ...parseFromValuesOrFunc(mantineFilterAutocompleteProps, arg),
        ...parseFromValuesOrFunc(columnDef.mantineFilterAutocompleteProps, arg),
    };
    const isRangeFilter = columnDef.filterVariant === "range" ||
        columnDef.filterVariant === "date-range" ||
        rangeFilterIndex !== undefined;
    const isSelectFilter = columnDef.filterVariant === "select";
    const isMultiSelectFilter = columnDef.filterVariant === "multi-select";
    const isDateFilter = columnDef.filterVariant === "date" ||
        columnDef.filterVariant === "date-range";
    const isAutoCompleteFilter = columnDef.filterVariant === "autocomplete";
    const allowedColumnFilterOptions = columnDef?.columnFilterModeOptions ?? columnFilterModeOptions;
    const currentFilterOption = columnDef._filterFn;
    const filterChipLabel = ["empty", "notEmpty"].includes(currentFilterOption)
        ? localizedFilterOption(localization, currentFilterOption)
        : "";
    const filterPlaceholder = !isRangeFilter
        ? (textInputProps?.placeholder ??
            localization.filterByColumn?.replace("{column}", String(columnDef.header)))
        : rangeFilterIndex === 0
            ? localization.min
            : rangeFilterIndex === 1
                ? localization.max
                : "";
    const facetedUniqueValues = column.getFacetedUniqueValues();
    const filterSelectOptions = react.useMemo(() => (autoCompleteProps?.data ??
        selectProps?.data ??
        multiSelectProps?.data ??
        ((isAutoCompleteFilter || isSelectFilter || isMultiSelectFilter) &&
            facetedUniqueValues
            ? Array.from(facetedUniqueValues.keys())
                .filter((key) => key !== null)
                .sort((a, b) => a.localeCompare(b))
            : [])).filter((o) => o !== undefined && o !== null), [
        autoCompleteProps?.data,
        facetedUniqueValues,
        isAutoCompleteFilter,
        isMultiSelectFilter,
        isSelectFilter,
        multiSelectProps?.data,
        selectProps?.data,
    ]);
    const isMounted = react.useRef(false);
    const [filterValue, setFilterValue] = react.useState(() => isMultiSelectFilter
        ? column.getFilterValue() || []
        : isRangeFilter
            ? column.getFilterValue()?.[rangeFilterIndex] || ""
            : (column.getFilterValue() ?? ""));
    const [debouncedFilterValue] = hooks.useDebouncedValue(filterValue, manualFiltering ? 400 : 200);
    //send debounced filterValue to table instance
    react.useEffect(() => {
        if (!isMounted.current)
            return;
        if (isRangeFilter) {
            column.setFilterValue((old) => {
                const newFilterValues = Array.isArray(old) ? old : ["", ""];
                newFilterValues[rangeFilterIndex] =
                    debouncedFilterValue;
                return newFilterValues;
            });
        }
        else {
            column.setFilterValue(debouncedFilterValue ?? undefined);
        }
    }, [debouncedFilterValue]);
    //receive table filter value and set it to local state
    react.useEffect(() => {
        if (!isMounted.current) {
            isMounted.current = true;
            return;
        }
        const tableFilterValue = column.getFilterValue();
        if (tableFilterValue === undefined) {
            handleClear();
        }
        else if (isRangeFilter && rangeFilterIndex !== undefined) {
            setFilterValue((tableFilterValue ?? ["", ""])[rangeFilterIndex]);
        }
        else {
            setFilterValue(tableFilterValue ?? "");
        }
    }, [column.getFilterValue()]);
    const handleClear = () => {
        if (isMultiSelectFilter) {
            setFilterValue([]);
            column.setFilterValue([]);
        }
        else if (isRangeFilter) {
            setFilterValue("");
            column.setFilterValue((old) => {
                const newFilterValues = Array.isArray(old) ? old : ["", ""];
                newFilterValues[rangeFilterIndex] = undefined;
                return newFilterValues;
            });
            // This is from Mantine v6 but it also applies for v7
            // https://github.com/mantinedev/mantine/issues/4716#issuecomment-1702699688
        }
        else if (isSelectFilter) {
            setFilterValue(null);
            column.setFilterValue(null);
        }
        else {
            setFilterValue("");
            column.setFilterValue(undefined);
        }
    };
    const handleClearEmptyFilterChip = () => {
        if (isMultiSelectFilter) {
            setFilterValue([]);
            column.setFilterValue([]);
        }
        else {
            setFilterValue("");
            column.setFilterValue(undefined);
        }
        setColumnFilterFns((prev) => ({
            ...prev,
            [header.id]: allowedColumnFilterOptions?.[0] ?? "fuzzy",
        }));
    };
    const { className, ...commonProps } = {
        "aria-label": filterPlaceholder,
        className: clsx("mrt-filter-text-input", classes$h.root, isDateFilter
            ? classes$h["date-filter"]
            : isRangeFilter
                ? classes$h["range-filter"]
                : !filterChipLabel && classes$h["not-filter-chip"]),
        disabled: !!filterChipLabel,
        onChange: setFilterValue,
        onClick: (event) => event.stopPropagation(),
        placeholder: filterPlaceholder,
        style: {
            ...(isMultiSelectFilter
                ? multiSelectProps?.style
                : isSelectFilter
                    ? selectProps?.style
                    : isDateFilter
                        ? dateInputProps?.style
                        : textInputProps?.style),
        },
        title: filterPlaceholder,
        value: isMultiSelectFilter && !Array.isArray(filterValue) ? [] : filterValue,
        variant: "unstyled",
    };
    const ClearButton = filterValue ? (jsxRuntime.jsx(core.ActionIcon, { "aria-label": localization.clearFilter, color: "var(--mantine-color-gray-7)", onClick: handleClear, size: "sm", title: localization.clearFilter ?? "", variant: "transparent", children: jsxRuntime.jsx(IconX, {}) })) : null;
    if (columnDef.Filter) {
        return (jsxRuntime.jsx(jsxRuntime.Fragment, { children: columnDef.Filter?.({ column, header, rangeFilterIndex, table }) }));
    }
    if (filterChipLabel) {
        return (jsxRuntime.jsx(core.Box, { style: commonProps.style, children: jsxRuntime.jsx(core.Badge, { className: classes$h["filter-chip-badge"], onClick: handleClearEmptyFilterChip, rightSection: ClearButton, size: "lg", children: filterChipLabel }) }));
    }
    if (isMultiSelectFilter) {
        return (jsxRuntime.jsx(core.MultiSelect, { ...commonProps, searchable: true, ...multiSelectProps, className: clsx(className, multiSelectProps.className), data: filterSelectOptions, onChange: (value) => setFilterValue(value), ref: (node) => {
                if (node) {
                    filterInputRefs.current[`${column.id}-${rangeFilterIndex ?? 0}`] =
                        node;
                    if (multiSelectProps.ref) {
                        multiSelectProps.ref.current = node;
                    }
                }
            }, rightSection: filterValue?.toString()?.length && multiSelectProps?.clearable
                ? ClearButton
                : undefined, style: commonProps.style }));
    }
    if (isSelectFilter) {
        return (jsxRuntime.jsx(core.Select, { ...commonProps, clearable: true, searchable: true, ...selectProps, className: clsx(className, selectProps.className), clearButtonProps: {
                size: "md",
            }, data: filterSelectOptions, ref: (node) => {
                if (node) {
                    filterInputRefs.current[`${column.id}-${rangeFilterIndex ?? 0}`] =
                        node;
                    if (selectProps.ref) {
                        selectProps.ref.current = node;
                    }
                }
            }, style: commonProps.style }));
    }
    if (isDateFilter) {
        return (jsxRuntime.jsx(dates.DateInput, { ...commonProps, allowDeselect: true, clearable: true, popoverProps: { withinPortal: columnFilterDisplayMode !== "popover" }, ...dateInputProps, className: clsx(className, dateInputProps.className), onChange: (event) => commonProps.onChange(event === null ? "" : event), ref: (node) => {
                if (node) {
                    filterInputRefs.current[`${column.id}-${rangeFilterIndex ?? 0}`] =
                        node;
                    if (dateInputProps.ref) {
                        dateInputProps.ref.current = node;
                    }
                }
            }, style: commonProps.style }));
    }
    if (isAutoCompleteFilter) {
        return (jsxRuntime.jsx(core.Autocomplete, { ...commonProps, onChange: (value) => setFilterValue(value), rightSection: filterValue?.toString()?.length ? ClearButton : undefined, ...autoCompleteProps, className: clsx(className, autoCompleteProps.className), data: filterSelectOptions, ref: (node) => {
                if (node) {
                    filterInputRefs.current[`${column.id}-${rangeFilterIndex ?? 0}`] =
                        node;
                    if (autoCompleteProps.ref) {
                        autoCompleteProps.ref.current = node;
                    }
                }
            }, style: commonProps.style }));
    }
    return (jsxRuntime.jsx(core.TextInput, { ...commonProps, onChange: (e) => setFilterValue(e.target.value), rightSection: filterValue?.toString()?.length ? ClearButton : undefined, ...textInputProps, className: clsx(className, textInputProps.className), mt: 0, ref: (node) => {
            if (node) {
                filterInputRefs.current[`${column.id}-${rangeFilterIndex ?? 0}`] =
                    node;
                if (textInputProps.ref) {
                    textInputProps.ref.current = node;
                }
            }
        }, style: commonProps.style }));
};

const MRT_FilterRangeFields = ({ header, table, ...rest }) => {
    return (jsxRuntime.jsxs(core.Box, { ...rest, className: clsx("mrt-filter-range-fields", classes$i.root, rest.className), children: [jsxRuntime.jsx(MRT_FilterTextInput, { header: header, rangeFilterIndex: 0, table: table }), jsxRuntime.jsx(MRT_FilterTextInput, { header: header, rangeFilterIndex: 1, table: table })] }));
};

var classes$g = {"root":"MRT_FilterRangeSlider-module_root__uwYEk"};

const MRT_FilterRangeSlider = ({ header, table, ...rest }) => {
    const { options: { mantineFilterRangeSliderProps }, refs: { filterInputRefs }, } = table;
    const { column } = header;
    const { columnDef } = column;
    const arg = { column, table };
    const rangeSliderProps = {
        ...parseFromValuesOrFunc(mantineFilterRangeSliderProps, arg),
        ...parseFromValuesOrFunc(columnDef.mantineFilterRangeSliderProps, arg),
        ...rest,
    };
    let [min, max] = rangeSliderProps.min !== undefined && rangeSliderProps.max !== undefined
        ? [rangeSliderProps.min, rangeSliderProps.max]
        : (column.getFacetedMinMaxValues() ?? [0, 1]);
    //fix potential TanStack Table bugs where min or max is an array
    if (Array.isArray(min))
        min = min[0];
    if (Array.isArray(max))
        max = max[0];
    if (min === null)
        min = 0;
    if (max === null)
        max = 1;
    const [filterValues, setFilterValues] = react.useState([
        min,
        max,
    ]);
    const columnFilterValue = column.getFilterValue();
    const isMounted = react.useRef(false);
    react.useEffect(() => {
        if (isMounted.current) {
            if (columnFilterValue === undefined) {
                setFilterValues([min, max]);
            }
            else if (Array.isArray(columnFilterValue)) {
                setFilterValues(columnFilterValue);
            }
        }
        isMounted.current = true;
    }, [columnFilterValue, min, max]);
    return (jsxRuntime.jsx(core.RangeSlider, { className: clsx("mrt-filter-range-slider", classes$g.root), max: max, min: min, onChange: (values) => {
            setFilterValues(values);
        }, onChangeEnd: (values) => {
            if (Array.isArray(values)) {
                if (values[0] <= min && values[1] >= max) {
                    //if the user has selected the entire range, remove the filter
                    column.setFilterValue(undefined);
                }
                else {
                    column.setFilterValue(values);
                }
            }
        }, value: filterValues, ...rangeSliderProps, ref: (node) => {
            if (node) {
                //@ts-expect-error
                filterInputRefs.current[`${column.id}-0`] = node;
                // @ts-expect-error
                if (rangeSliderProps?.ref) {
                    //@ts-expect-error
                    rangeSliderProps.ref = node;
                }
            }
        } }));
};

var classes$f = {"symbol":"MRT_FilterOptionMenu-module_symbol__a1Bsy"};

const mrtFilterOptions = (localization) => [
    {
        divider: false,
        label: localization.filterFuzzy,
        option: "fuzzy",
        symbol: "≈",
    },
    {
        divider: false,
        label: localization.filterContains,
        option: "contains",
        symbol: "*",
    },
    {
        divider: false,
        label: localization.filterStartsWith,
        option: "startsWith",
        symbol: "a",
    },
    {
        divider: true,
        label: localization.filterEndsWith,
        option: "endsWith",
        symbol: "z",
    },
    {
        divider: false,
        label: localization.filterEquals,
        option: "equals",
        symbol: "=",
    },
    {
        divider: true,
        label: localization.filterNotEquals,
        option: "notEquals",
        symbol: "≠",
    },
    {
        divider: false,
        label: localization.filterBetween,
        option: "between",
        symbol: "⇿",
    },
    {
        divider: true,
        label: localization.filterBetweenInclusive,
        option: "betweenInclusive",
        symbol: "⬌",
    },
    {
        divider: false,
        label: localization.filterGreaterThan,
        option: "greaterThan",
        symbol: ">",
    },
    {
        divider: false,
        label: localization.filterGreaterThanOrEqualTo,
        option: "greaterThanOrEqualTo",
        symbol: "≥",
    },
    {
        divider: false,
        label: localization.filterLessThan,
        option: "lessThan",
        symbol: "<",
    },
    {
        divider: true,
        label: localization.filterLessThanOrEqualTo,
        option: "lessThanOrEqualTo",
        symbol: "≤",
    },
    {
        divider: false,
        label: localization.filterEmpty,
        option: "empty",
        symbol: "∅",
    },
    {
        divider: false,
        label: localization.filterNotEmpty,
        option: "notEmpty",
        symbol: "!∅",
    },
];
const rangeModes = ["between", "betweenInclusive", "inNumberRange"];
const emptyModes = ["empty", "notEmpty"];
const arrModes = ["arrIncludesSome", "arrIncludesAll", "arrIncludes"];
const rangeVariants = ["range-slider", "date-range", "range"];
const MRT_FilterOptionMenu = ({ header, onSelect, table, }) => {
    const { getState, options: { columnFilterModeOptions, globalFilterModeOptions, localization, renderColumnFilterModeMenuItems, renderGlobalFilterModeMenuItems, }, setColumnFilterFns, setGlobalFilterFn, } = table;
    const { globalFilterFn } = getState();
    const { column } = header ?? {};
    const { columnDef } = column ?? {};
    const currentFilterValue = column?.getFilterValue();
    let allowedColumnFilterOptions = columnDef?.columnFilterModeOptions ?? columnFilterModeOptions;
    if (rangeVariants.includes(columnDef?.filterVariant)) {
        allowedColumnFilterOptions = [
            ...rangeModes,
            ...(allowedColumnFilterOptions ?? []),
        ].filter((option) => rangeModes.includes(option));
    }
    const internalFilterOptions = react.useMemo(() => {
        const filterOptions = mrtFilterOptions(localization).filter((filterOption) => columnDef
            ? allowedColumnFilterOptions === undefined ||
                allowedColumnFilterOptions?.includes(filterOption.option)
            : (!globalFilterModeOptions ||
                globalFilterModeOptions.includes(filterOption.option)) &&
                ["contains", "fuzzy", "startsWith"].includes(filterOption.option));
        if (filterOptions[filterOptions.length - 1].divider) {
            filterOptions[filterOptions.length - 1].divider = false;
        }
        return filterOptions;
    }, [columnDef, globalFilterModeOptions]);
    const handleSelectFilterMode = (option) => {
        const prevFilterMode = columnDef?._filterFn ?? "";
        if (!header || !column) {
            // global filter mode
            setGlobalFilterFn(option);
        }
        else if (option !== prevFilterMode) {
            // column filter mode
            setColumnFilterFns((prev) => ({
                ...prev,
                [header.id]: option,
            }));
            // reset filter value and/or perform new filter render
            if (emptyModes.includes(option)) {
                // will now be empty/notEmpty filter mode
                if (currentFilterValue !== " " &&
                    !emptyModes.includes(prevFilterMode)) {
                    column.setFilterValue(" ");
                }
                else if (currentFilterValue) {
                    column.setFilterValue(currentFilterValue); // perform new filter render
                }
            }
            else if (columnDef?.filterVariant === "multi-select" ||
                arrModes.includes(option)) {
                // will now be array filter mode
                if (currentFilterValue instanceof String ||
                    currentFilterValue?.length) {
                    column.setFilterValue([]);
                }
                else if (currentFilterValue) {
                    column.setFilterValue(currentFilterValue); // perform new filter render
                }
            }
            else if (rangeVariants.includes(columnDef?.filterVariant) ||
                rangeModes.includes(option)) {
                // will now be range filter mode
                if (!Array.isArray(currentFilterValue) ||
                    (!currentFilterValue?.every((v) => v === "") &&
                        !rangeModes.includes(prevFilterMode))) {
                    column.setFilterValue(["", ""]);
                }
                else {
                    column.setFilterValue(currentFilterValue); // perform new filter render
                }
            }
            else {
                // will now be single value filter mode
                if (Array.isArray(currentFilterValue)) {
                    column.setFilterValue("");
                }
                else if (currentFilterValue === " " &&
                    emptyModes.includes(prevFilterMode)) {
                    column.setFilterValue(undefined);
                }
                else {
                    column.setFilterValue(currentFilterValue); // perform new filter render
                }
            }
        }
        onSelect?.();
    };
    const filterOption = header && columnDef ? columnDef._filterFn : globalFilterFn;
    return (jsxRuntime.jsx(core.Menu.Dropdown, { children: (header && column && columnDef
            ? (columnDef.renderColumnFilterModeMenuItems?.({
                column: column,
                internalFilterOptions,
                onSelectFilterMode: handleSelectFilterMode,
                table,
            }) ??
                renderColumnFilterModeMenuItems?.({
                    column: column,
                    internalFilterOptions,
                    onSelectFilterMode: handleSelectFilterMode,
                    table,
                }))
            : renderGlobalFilterModeMenuItems?.({
                internalFilterOptions,
                onSelectFilterMode: handleSelectFilterMode,
                table,
            })) ??
            internalFilterOptions.map(({ divider, label, option, symbol }, index) => (jsxRuntime.jsxs(react.Fragment, { children: [jsxRuntime.jsx(core.Menu.Item, { color: option === filterOption ? "blue" : undefined, leftSection: jsxRuntime.jsx("span", { className: classes$f.symbol, children: symbol }), onClick: () => handleSelectFilterMode(option), value: option, children: label }), divider && jsxRuntime.jsx(core.Menu.Divider, {})] }, index))) }));
};

var classes$e = {"filter-mode-label":"MRT_TableHeadCellFilterContainer-module_filter-mode-label__8reK-"};

const MRT_TableHeadCellFilterContainer = ({ header, table, ...rest }) => {
    const { getState, options: { columnFilterDisplayMode, columnFilterModeOptions, enableColumnFilterModes, icons: { IconFilterCog }, localization, }, refs: { filterInputRefs }, } = table;
    const { showColumnFilters } = getState();
    const { column } = header;
    const { columnDef } = column;
    const currentFilterOption = columnDef._filterFn;
    const allowedColumnFilterOptions = columnDef?.columnFilterModeOptions ?? columnFilterModeOptions;
    const showChangeModeButton = enableColumnFilterModes &&
        columnDef.enableColumnFilterModes !== false &&
        (allowedColumnFilterOptions === undefined ||
            !!allowedColumnFilterOptions?.length);
    return (jsxRuntime.jsx(core.Collapse, { in: showColumnFilters || columnFilterDisplayMode === "popover", children: jsxRuntime.jsxs(core.Flex, { direction: "column", ...rest, children: [jsxRuntime.jsxs(core.Flex, { align: "flex-end", children: [columnDef.filterVariant === "checkbox" ? (jsxRuntime.jsx(MRT_FilterCheckbox, { column: column, table: table })) : columnDef.filterVariant === "range-slider" ? (jsxRuntime.jsx(MRT_FilterRangeSlider, { header: header, table: table })) : ["date-range", "range"].includes(columnDef.filterVariant ?? "") ||
                            ["between", "betweenInclusive", "inNumberRange"].includes(columnDef._filterFn) ? (jsxRuntime.jsx(MRT_FilterRangeFields, { header: header, table: table })) : (jsxRuntime.jsx(MRT_FilterTextInput, { header: header, table: table })), showChangeModeButton && (jsxRuntime.jsxs(core.Menu, { withinPortal: columnFilterDisplayMode !== "popover", children: [jsxRuntime.jsx(core.Tooltip, { label: localization.changeFilterMode, position: "bottom-start", withinPortal: true, children: jsxRuntime.jsx(core.Menu.Target, { children: jsxRuntime.jsx(core.ActionIcon, { "aria-label": localization.changeFilterMode, color: "gray", size: "md", variant: "subtle", children: jsxRuntime.jsx(IconFilterCog, {}) }) }) }), jsxRuntime.jsx(MRT_FilterOptionMenu, { header: header, onSelect: () => setTimeout(() => filterInputRefs.current[`${column.id}-0`]?.focus(), 100), table: table })] }))] }), showChangeModeButton ? (jsxRuntime.jsx(core.Text, { c: "dimmed", className: classes$e["filter-mode-label"], component: "label", children: localization.filterMode.replace("{filterType}", localizedFilterOption(localization, currentFilterOption)) })) : null] }) }));
};

var classes$d = {"root":"MRT_TableHeadCellFilterLabel-module_root__Rur2R"};

const MRT_TableHeadCellFilterLabel = ({ header, table, ...rest }) => {
    const { options: { columnFilterDisplayMode, icons: { IconFilter }, localization, }, refs: { filterInputRefs }, setShowColumnFilters, } = table;
    const { column } = header;
    const { columnDef } = column;
    const filterValue = column.getFilterValue();
    const [popoverOpened, setPopoverOpened] = react.useState(false);
    const isFilterActive = (Array.isArray(filterValue) && filterValue.some(Boolean)) ||
        (!!filterValue && !Array.isArray(filterValue));
    const isRangeFilter = columnDef.filterVariant === "range" ||
        columnDef.filterVariant === "date-range" ||
        ["between", "betweenInclusive", "inNumberRange"].includes(columnDef._filterFn);
    const currentFilterOption = columnDef._filterFn;
    const filterValueFn = columnDef.filterTooltipValueFn || ((value) => value);
    const filterTooltip = columnFilterDisplayMode === "popover" && !isFilterActive
        ? localization.filterByColumn?.replace("{column}", String(columnDef.header))
        : localization.filteringByColumn
            .replace("{column}", String(columnDef.header))
            .replace("{filterType}", localizedFilterOption(localization, currentFilterOption))
            .replace("{filterValue}", `"${Array.isArray(column.getFilterValue())
            ? column.getFilterValue()
                .map((v) => filterValueFn(v))
                .join(`" ${isRangeFilter ? localization.and : localization.or} "`)
            : filterValueFn(column.getFilterValue())}"`)
            .replace('" "', "");
    return (jsxRuntime.jsx(jsxRuntime.Fragment, { children: jsxRuntime.jsxs(core.Popover, { keepMounted: columnDef.filterVariant === "range-slider", onChange: setPopoverOpened, onClose: () => setPopoverOpened(false), opened: popoverOpened, position: "top", shadow: "xl", width: 360, withinPortal: true, children: [jsxRuntime.jsx(core.Transition, { mounted: columnFilterDisplayMode === "popover" ||
                        (!!column.getFilterValue() && !isRangeFilter) ||
                        (isRangeFilter &&
                            (!!column.getFilterValue()?.[0] ||
                                !!column.getFilterValue()?.[1])), transition: "scale", children: () => (jsxRuntime.jsx(core.Popover.Target, { children: jsxRuntime.jsx(core.Tooltip, { disabled: popoverOpened, label: filterTooltip, multiline: true, w: filterTooltip.length > 40 ? 300 : undefined, withinPortal: true, children: jsxRuntime.jsx(core.ActionIcon, { "aria-label": filterTooltip, className: clsx("mrt-table-head-cell-filter-label-icon", classes$d.root), size: 18, ...dataVariable("active", isFilterActive), onClick: (event) => {
                                    event.stopPropagation();
                                    if (columnFilterDisplayMode === "popover") {
                                        setPopoverOpened((opened) => !opened);
                                    }
                                    else {
                                        setShowColumnFilters(true);
                                    }
                                    setTimeout(() => {
                                        const input = filterInputRefs.current[`${column.id}-0`];
                                        input?.focus();
                                        input?.select();
                                    }, 100);
                                }, ...rest, children: jsxRuntime.jsx(IconFilter, { size: "100%" }) }) }) })) }), columnFilterDisplayMode === "popover" && (jsxRuntime.jsx(core.Popover.Dropdown, { onClick: (event) => event.stopPropagation(), onKeyDown: (event) => event.key === "Enter" && setPopoverOpened(false), onMouseDown: (event) => event.stopPropagation(), children: jsxRuntime.jsx(MRT_TableHeadCellFilterContainer, { header: header, table: table }) }))] }) }));
};

const MRT_TableHeadCellGrabHandle = ({ column, table, tableHeadCellRef, ...rest }) => {
    const { getState, options: { enableColumnOrdering, mantineColumnDragHandleProps }, setColumnOrder, setDraggingColumn, setHoveredColumn, } = table;
    const { columnDef } = column;
    const { columnOrder, draggingColumn, hoveredColumn } = getState();
    const arg = { column, table };
    const actionIconProps = {
        ...parseFromValuesOrFunc(mantineColumnDragHandleProps, arg),
        ...parseFromValuesOrFunc(columnDef.mantineColumnDragHandleProps, arg),
        ...rest,
    };
    const handleDragStart = (event) => {
        actionIconProps?.onDragStart?.(event);
        setDraggingColumn(column);
        event.dataTransfer.setDragImage(tableHeadCellRef.current, 0, 0);
    };
    const handleDragEnd = (event) => {
        actionIconProps?.onDragEnd?.(event);
        if (hoveredColumn?.id === "drop-zone") {
            column.toggleGrouping();
        }
        else if (enableColumnOrdering &&
            hoveredColumn &&
            hoveredColumn?.id !== draggingColumn?.id) {
            setColumnOrder(reorderColumn(column, hoveredColumn, columnOrder));
        }
        setDraggingColumn(null);
        setHoveredColumn(null);
    };
    return (jsxRuntime.jsx(MRT_GrabHandleButton, { actionIconProps: actionIconProps, onDragEnd: handleDragEnd, onDragStart: handleDragStart, table: table }));
};

var classes$c = {"root":"MRT_TableHeadCellResizeHandle-module_root__paufe","root-ltr":"MRT_TableHeadCellResizeHandle-module_root-ltr__652AZ","root-rtl":"MRT_TableHeadCellResizeHandle-module_root-rtl__5VlSo","root-hide":"MRT_TableHeadCellResizeHandle-module_root-hide__-ILlD"};

const MRT_TableHeadCellResizeHandle = ({ header, table, ...rest }) => {
    const { getState, options: { columnResizeDirection, columnResizeMode }, setColumnSizingInfo, } = table;
    const { density } = getState();
    const { column } = header;
    const handler = header.getResizeHandler();
    const offset = column.getIsResizing() && columnResizeMode === "onEnd"
        ? `translateX(${(columnResizeDirection === "rtl" ? -1 : 1) *
            (getState().columnSizingInfo.deltaOffset ?? 0)}px)`
        : undefined;
    return (jsxRuntime.jsx(core.Box, { onDoubleClick: () => {
            setColumnSizingInfo((old) => ({
                ...old,
                isResizingColumn: false,
            }));
            column.resetSize();
        }, onMouseDown: handler, onTouchStart: handler, role: "separator", ...rest, __vars: { "--mrt-transform": offset, ...rest.__vars }, className: clsx("mrt-table-head-cell-resize-handle", classes$c.root, classes$c[`root-${columnResizeDirection}`], !header.subHeaders.length &&
            columnResizeMode === "onChange" &&
            classes$c["root-hide"], density, rest.className) }));
};

var classes$b = {"sort-icon":"MRT_TableHeadCellSortLabel-module_sort-icon__zs1xA","multi-sort-indicator":"MRT_TableHeadCellSortLabel-module_multi-sort-indicator__MGBj2"};

const MRT_TableHeadCellSortLabel = ({ header, table, ...rest }) => {
    const { getState, options: { icons: { IconArrowsSort, IconSortAscending, IconSortDescending }, localization, }, } = table;
    const column = header.column;
    const { columnDef } = column;
    const { sorting } = getState();
    const sorted = column.getIsSorted();
    const sortIndex = column.getSortIndex();
    const sortTooltip = sorted
        ? sorted === "desc"
            ? localization.sortedByColumnDesc.replace("{column}", columnDef.header)
            : localization.sortedByColumnAsc.replace("{column}", columnDef.header)
        : column.getNextSortingOrder() === "desc"
            ? localization.sortByColumnDesc.replace("{column}", columnDef.header)
            : localization.sortByColumnAsc.replace("{column}", columnDef.header);
    const SortActionButton = (jsxRuntime.jsx(core.ActionIcon, { "aria-label": sortTooltip, ...dataVariable("sorted", sorted), ...rest, className: clsx("mrt-table-head-sort-button", classes$b["sort-icon"], rest.className), children: sorted === "desc" ? (jsxRuntime.jsx(IconSortDescending, { size: "100%" })) : sorted === "asc" ? (jsxRuntime.jsx(IconSortAscending, { size: "100%" })) : (jsxRuntime.jsx(IconArrowsSort, { size: "100%" })) }));
    return (jsxRuntime.jsx(core.Tooltip, { label: sortTooltip, openDelay: 1000, withinPortal: true, children: sorting.length < 2 || sortIndex === -1 ? (SortActionButton) : (jsxRuntime.jsx(core.Indicator, { classNames: {
                root: clsx("mrt-table-head-multi-sort-indicator", classes$b["multi-sort-indicator"]),
            }, inline: true, label: sortIndex + 1, offset: 4, children: SortActionButton })) }));
};

const MRT_TableHeadCell = ({ columnVirtualizer, header, renderedHeaderIndex = 0, table, ...rest }) => {
    const direction = core.useDirection();
    const { getState, options: { columnFilterDisplayMode, columnResizeDirection, columnResizeMode, enableColumnActions, enableColumnDragging, enableColumnOrdering, enableColumnPinning, enableGrouping, enableHeaderActionsHoverReveal, enableMultiSort, layoutMode, mantineTableHeadCellProps, }, refs: { tableHeadCellRefs }, setHoveredColumn, } = table;
    const { columnSizingInfo, draggingColumn, grouping, hoveredColumn } = getState();
    const { column } = header;
    const { columnDef } = column;
    const { columnDefType } = columnDef;
    const arg = { column, table };
    const tableCellProps = {
        ...parseFromValuesOrFunc(mantineTableHeadCellProps, arg),
        ...parseFromValuesOrFunc(columnDef.mantineTableHeadCellProps, arg),
        ...rest,
    };
    const widthStyles = {
        minWidth: `max(calc(var(--header-${parseCSSVarId(header?.id)}-size) * 1px), ${columnDef.minSize ?? 30}px)`,
        width: `calc(var(--header-${parseCSSVarId(header.id)}-size) * 1px)`,
    };
    if (layoutMode === "grid") {
        widthStyles.flex = `${[0, false].includes(columnDef.grow)
            ? 0
            : `var(--header-${parseCSSVarId(header.id)}-size)`} 0 auto`;
    }
    else if (layoutMode === "grid-no-grow") {
        widthStyles.flex = `${+(columnDef.grow || 0)} 0 auto`;
    }
    const isColumnPinned = enableColumnPinning &&
        columnDef.columnDefType !== "group" &&
        column.getIsPinned();
    const isDraggingColumn = draggingColumn?.id === column.id;
    const isHoveredColumn = hoveredColumn?.id === column.id;
    const { hovered: isHoveredHeadCell, ref: isHoveredHeadCellRef } = hooks.useHover();
    const [isOpenedColumnActions, setIsOpenedColumnActions] = react.useState(false);
    const columnActionsEnabled = (enableColumnActions || columnDef.enableColumnActions) &&
        columnDef.enableColumnActions !== false;
    const showColumnButtons = !enableHeaderActionsHoverReveal ||
        isOpenedColumnActions ||
        (isHoveredHeadCell &&
            !table.getVisibleFlatColumns().find((column) => column.getIsResizing()));
    const showDragHandle = enableColumnDragging !== false &&
        columnDef.enableColumnDragging !== false &&
        (enableColumnDragging ||
            (enableColumnOrdering && columnDef.enableColumnOrdering !== false) ||
            (enableGrouping &&
                columnDef.enableGrouping !== false &&
                !grouping.includes(column.id))) &&
        showColumnButtons;
    const headerPL = react.useMemo(() => {
        let pl = 0;
        if (column.getCanSort())
            pl++;
        // Only add padding for buttons if they will actually be displayed
        if (showColumnButtons && (columnActionsEnabled || showDragHandle))
            pl += 1.75;
        if (showDragHandle)
            pl += 1.25;
        return pl;
    }, [showColumnButtons, showDragHandle, columnActionsEnabled]);
    const handleDragEnter = (_e) => {
        if (enableGrouping && hoveredColumn?.id === "drop-zone") {
            setHoveredColumn(null);
        }
        if (enableColumnOrdering && draggingColumn && columnDefType !== "group") {
            setHoveredColumn(columnDef.enableColumnOrdering !== false ? column : null);
        }
    };
    const headerElement = columnDef?.Header instanceof Function
        ? columnDef?.Header?.({
            column,
            header,
            table,
        })
        : (columnDef?.Header ?? columnDef.header);
    return (jsxRuntime.jsxs(core.TableTh, { colSpan: header.colSpan, "data-column-pinned": isColumnPinned || undefined, "data-dragging-column": isDraggingColumn || undefined, "data-first-right-pinned": (isColumnPinned === "right" &&
            column.getIsFirstColumn(isColumnPinned)) ||
            undefined, "data-hovered-column-target": isHoveredColumn || undefined, "data-index": renderedHeaderIndex, "data-last-left-pinned": (isColumnPinned === "left" && column.getIsLastColumn(isColumnPinned)) ||
            undefined, "data-resizing": (columnResizeMode === "onChange" &&
            columnSizingInfo?.isResizingColumn === column.id &&
            columnResizeDirection) ||
            undefined, ...tableCellProps, __vars: {
            "--mrt-table-cell-left": isColumnPinned === "left"
                ? `${column.getStart(isColumnPinned)}`
                : undefined,
            "--mrt-table-cell-right": isColumnPinned === "right"
                ? `${column.getAfter(isColumnPinned)}`
                : undefined,
        }, align: columnDefType === "group"
            ? "center"
            : direction.dir === "rtl"
                ? "right"
                : "left", className: clsx(classes$k.root, layoutMode?.startsWith("grid") && classes$k["root-grid"], enableMultiSort && column.getCanSort() && classes$k["root-no-select"], columnVirtualizer && classes$k["root-virtualized"], tableCellProps?.className), onDragEnter: handleDragEnter, ref: (node) => {
            if (node) {
                tableHeadCellRefs.current[column.id] = node;
                isHoveredHeadCellRef(node);
                if (columnDefType !== "group") {
                    columnVirtualizer?.measureElement?.(node);
                }
            }
        }, style: (theme) => ({
            ...widthStyles,
            ...parseFromValuesOrFunc(tableCellProps?.style, theme),
        }), children: [header.isPlaceholder
                ? null
                : (tableCellProps.children ?? (jsxRuntime.jsxs(core.Flex, { className: clsx("mrt-table-head-cell-content", classes$k.content, (columnDefType === "group" ||
                        tableCellProps?.align === "center") &&
                        classes$k["content-center"], tableCellProps?.align === "right" && classes$k["content-right"], column.getCanResize() && classes$k["content-spaced"]), children: [jsxRuntime.jsxs(core.Flex, { __vars: {
                                "--mrt-table-head-cell-labels-padding-left": `${headerPL}`,
                            }, className: clsx("mrt-table-head-cell-labels", classes$k.labels, column.getCanSort() &&
                                columnDefType !== "group" &&
                                classes$k["labels-sortable"], tableCellProps?.align === "right"
                                ? classes$k["labels-right"]
                                : tableCellProps?.align === "center" &&
                                    classes$k["labels-center"], columnDefType === "data" && classes$k["labels-data"]), onClick: column.getToggleSortingHandler(), children: [jsxRuntime.jsx(core.Flex, { className: clsx("mrt-table-head-cell-content-wrapper", classes$k["content-wrapper"], columnDefType === "data" &&
                                        classes$k["content-wrapper-hidden-overflow"], (columnDef.header?.length ?? 0) < 20 &&
                                        classes$k["content-wrapper-nowrap"]), children: headerElement }), column.getCanFilter() &&
                                    (column.getIsFiltered() || showColumnButtons) && (jsxRuntime.jsx(MRT_TableHeadCellFilterLabel, { header: header, table: table })), column.getCanSort() &&
                                    (column.getIsSorted() || showColumnButtons) && (jsxRuntime.jsx(MRT_TableHeadCellSortLabel, { header: header, table: table }))] }), columnDefType !== "group" && (jsxRuntime.jsxs(core.Flex, { className: clsx("mrt-table-head-cell-content-actions", classes$k["content-actions"]), children: [showDragHandle && (jsxRuntime.jsx(MRT_TableHeadCellGrabHandle, { column: column, table: table, tableHeadCellRef: {
                                        current: tableHeadCellRefs.current[column.id],
                                    } })), columnActionsEnabled && showColumnButtons && (jsxRuntime.jsx(MRT_ColumnActionMenu, { header: header, onChange: setIsOpenedColumnActions, opened: isOpenedColumnActions, table: table }))] })), column.getCanResize() && (jsxRuntime.jsx(MRT_TableHeadCellResizeHandle, { header: header, table: table }))] }))), columnFilterDisplayMode === "subheader" && column.getCanFilter() && (jsxRuntime.jsx(MRT_TableHeadCellFilterContainer, { header: header, table: table }))] }));
};

var classes$a = {"root":"MRT_TableHeadRow-module_root__hUKv4","layout-mode-grid":"MRT_TableHeadRow-module_layout-mode-grid__4ZGri","sticky":"MRT_TableHeadRow-module_sticky__Ej7Ax"};

const MRT_TableHeadRow = ({ columnVirtualizer, headerGroup, table, ...rest }) => {
    const { getState, options: { enableStickyHeader, layoutMode, mantineTableHeadRowProps }, } = table;
    const { isFullScreen } = getState();
    const { virtualColumns, virtualPaddingLeft, virtualPaddingRight } = columnVirtualizer ?? {};
    const tableRowProps = {
        ...parseFromValuesOrFunc(mantineTableHeadRowProps, {
            headerGroup,
            table,
        }),
        ...rest,
    };
    return (jsxRuntime.jsxs(core.TableTr, { ...tableRowProps, className: clsx(classes$a.root, (enableStickyHeader || isFullScreen) && classes$a.sticky, layoutMode?.startsWith("grid") && classes$a["layout-mode-grid"], tableRowProps?.className), children: [virtualPaddingLeft ? (jsxRuntime.jsx(core.Box, { component: "th", display: "flex", w: virtualPaddingLeft })) : null, (virtualColumns ?? headerGroup.headers).map((headerOrVirtualHeader, renderedHeaderIndex) => {
                let header = headerOrVirtualHeader;
                if (columnVirtualizer) {
                    renderedHeaderIndex = headerOrVirtualHeader
                        .index;
                    header = headerGroup.headers[renderedHeaderIndex];
                }
                return (jsxRuntime.jsx(MRT_TableHeadCell, { columnVirtualizer: columnVirtualizer, header: header, renderedHeaderIndex: renderedHeaderIndex, table: table }, header.id));
            }), virtualPaddingRight ? (jsxRuntime.jsx(core.Box, { component: "th", display: "flex", w: virtualPaddingRight })) : null] }));
};

const MRT_TableHead = ({ columnVirtualizer, table, ...rest }) => {
    const { getHeaderGroups, getSelectedRowModel, getState, options: { enableStickyHeader, layoutMode, mantineTableHeadProps, positionToolbarAlertBanner, }, refs: { tableHeadRef }, } = table;
    const { isFullScreen, showAlertBanner } = getState();
    const tableHeadProps = {
        ...parseFromValuesOrFunc(mantineTableHeadProps, {
            table,
        }),
        ...rest,
    };
    const stickyHeader = enableStickyHeader || isFullScreen;
    return (jsxRuntime.jsx(core.TableThead, { ...tableHeadProps, className: clsx(classes$m.root, layoutMode?.startsWith("grid")
            ? classes$m["root-grid"]
            : classes$m["root-table-row-group"], stickyHeader && classes$m["root-sticky"], tableHeadProps?.className), pos: stickyHeader && layoutMode?.startsWith("grid") ? "sticky" : "relative", ref: (ref) => {
            tableHeadRef.current = ref;
            if (tableHeadProps?.ref) {
                tableHeadProps.ref.current = ref;
            }
        }, children: positionToolbarAlertBanner === "head-overlay" &&
            (showAlertBanner || getSelectedRowModel().rows.length > 0) ? (jsxRuntime.jsx(core.TableTr, { className: clsx(classes$m["banner-tr"], layoutMode?.startsWith("grid") && classes$m.grid), children: jsxRuntime.jsx(core.TableTh, { className: clsx(classes$m["banner-th"], layoutMode?.startsWith("grid") && classes$m.grid), colSpan: table.getVisibleLeafColumns().length, children: jsxRuntime.jsx(MRT_ToolbarAlertBanner, { table: table }) }) })) : (getHeaderGroups().map((headerGroup) => (jsxRuntime.jsx(MRT_TableHeadRow, { columnVirtualizer: columnVirtualizer, headerGroup: headerGroup, table: table }, headerGroup.id)))) }));
};

var classes$9 = {"root":"MRT_GlobalFilterTextInput-module_root__Xmcpv","collapse":"MRT_GlobalFilterTextInput-module_collapse__v311d"};

const MRT_GlobalFilterTextInput = ({ table, ...rest }) => {
    const { getState, options: { enableGlobalFilterModes, icons: { IconSearch, IconX }, localization, mantineSearchTextInputProps, manualFiltering, positionGlobalFilter, }, refs: { searchInputRef }, setGlobalFilter, } = table;
    const { globalFilter, showGlobalFilter } = getState();
    const textFieldProps = {
        ...parseFromValuesOrFunc(mantineSearchTextInputProps, {
            table,
        }),
        ...rest,
    };
    const isMounted = react.useRef(false);
    const [searchValue, setSearchValue] = react.useState(globalFilter ?? "");
    const [debouncedSearchValue] = hooks.useDebouncedValue(searchValue, manualFiltering ? 500 : 250);
    react.useEffect(() => {
        setGlobalFilter(debouncedSearchValue || undefined);
    }, [debouncedSearchValue]);
    const handleClear = () => {
        setSearchValue("");
        setGlobalFilter(undefined);
    };
    react.useEffect(() => {
        if (isMounted.current) {
            if (globalFilter === undefined) {
                handleClear();
            }
            else {
                setSearchValue(globalFilter);
            }
        }
        isMounted.current = true;
    }, [globalFilter]);
    return (jsxRuntime.jsxs(core.Collapse, { className: classes$9.collapse, in: showGlobalFilter, children: [enableGlobalFilterModes && (jsxRuntime.jsxs(core.Menu, { withinPortal: true, children: [jsxRuntime.jsx(core.Menu.Target, { children: jsxRuntime.jsx(core.ActionIcon, { "aria-label": localization.changeSearchMode, color: "gray", size: "sm", variant: "transparent", children: jsxRuntime.jsx(IconSearch, {}) }) }), jsxRuntime.jsx(MRT_FilterOptionMenu, { onSelect: handleClear, table: table })] })), jsxRuntime.jsx(core.TextInput, { leftSection: !enableGlobalFilterModes && jsxRuntime.jsx(IconSearch, {}), mt: 0, mx: positionGlobalFilter !== "left" ? "mx" : undefined, onChange: (event) => setSearchValue(event.target.value), placeholder: localization.search, rightSection: jsxRuntime.jsx(core.ActionIcon, { "aria-label": localization.clearSearch, color: "gray", disabled: !searchValue?.length, hidden: !searchValue, onClick: handleClear, size: "sm", style: {
                        visibility: !searchValue ? "hidden" : undefined,
                    }, variant: "transparent", children: jsxRuntime.jsx(core.Tooltip, { label: localization.clearSearch, withinPortal: true, children: jsxRuntime.jsx(IconX, {}) }) }), value: searchValue ?? "", variant: "filled", ...textFieldProps, className: clsx("mrt-global-filter-text-input", classes$9.root, textFieldProps?.className), ref: (node) => {
                    if (node) {
                        searchInputRef.current = node;
                        if (textFieldProps?.ref) {
                            // @ts-expect-error
                            textFieldProps.ref = node;
                        }
                    }
                } })] }));
};

const flexRender = reactTable.flexRender;
function createMRTColumnHelper() {
    return {
        accessor: (accessor, column) => {
            return typeof accessor === "function"
                ? {
                    ...column,
                    accessorFn: accessor,
                }
                : {
                    ...column,
                    accessorKey: accessor,
                };
        },
        display: (column) => column,
        group: (column) => column,
    };
}
const createRow = (table, originalRow, rowIndex = -1, depth = 0, subRows, parentId) => reactTable.createRow(table, "mrt-row-create", originalRow ??
    Object.assign({}, ...getAllLeafColumnDefs(table.options.columns).map((col) => ({
        [getColumnId(col)]: "",
    }))), rowIndex, depth, subRows, parentId);

const getMRT_RowActionsColumnDef = (tableOptions) => {
    return {
        Cell: ({ cell, row, table }) => (jsxRuntime.jsx(MRT_ToggleRowActionMenuButton, { cell: cell, row: row, table: table })),
        ...defaultDisplayColumnProps({
            header: "actions",
            id: "mrt-row-actions",
            size: 70,
            tableOptions,
        }),
    };
};

const getMRT_RowDragColumnDef = (tableOptions) => {
    return {
        Cell: ({ row, rowRef, table }) => (jsxRuntime.jsx(MRT_TableBodyRowGrabHandle, { row: row, rowRef: rowRef, table: table })),
        grow: false,
        ...defaultDisplayColumnProps({
            header: "move",
            id: "mrt-row-drag",
            size: 60,
            tableOptions,
        }),
    };
};

const getMRT_RowExpandColumnDef = (tableOptions) => {
    const { defaultColumn, enableExpandAll, groupedColumnMode, positionExpandColumn, renderDetailPanel, state: { grouping }, } = tableOptions;
    const alignProps = positionExpandColumn === "last"
        ? {
            align: "right",
        }
        : undefined;
    return {
        Cell: ({ cell, column, row, table }) => {
            const expandButtonProps = { row, table };
            const subRowsLength = row.subRows?.length;
            if (tableOptions.groupedColumnMode === "remove" && row.groupingColumnId) {
                return (jsxRuntime.jsxs(core.Flex, { align: "center", gap: "0.25rem", children: [jsxRuntime.jsx(MRT_ExpandButton, { ...expandButtonProps }), jsxRuntime.jsx(core.Tooltip, { label: table.getColumn(row.groupingColumnId).columnDef.header, openDelay: 1000, position: "right", children: jsxRuntime.jsx("span", { children: row.groupingValue }) }), !!subRowsLength && jsxRuntime.jsxs("span", { children: ["(", subRowsLength, ")"] })] }));
            }
            else {
                return (jsxRuntime.jsxs(jsxRuntime.Fragment, { children: [jsxRuntime.jsx(MRT_ExpandButton, { ...expandButtonProps }), column.columnDef.GroupedCell?.({ cell, column, row, table })] }));
            }
        },
        Header: enableExpandAll
            ? ({ table }) => {
                return (jsxRuntime.jsxs(core.Flex, { align: "center", children: [jsxRuntime.jsx(MRT_ExpandAllButton, { table: table }), groupedColumnMode === "remove" &&
                            grouping
                                ?.map((groupedColumnId) => table.getColumn(groupedColumnId).columnDef.header)
                                ?.join(", ")] }));
            }
            : undefined,
        mantineTableBodyCellProps: alignProps,
        mantineTableHeadCellProps: alignProps,
        ...defaultDisplayColumnProps({
            header: "expand",
            id: "mrt-row-expand",
            size: groupedColumnMode === "remove"
                ? (defaultColumn?.size ?? 180)
                : renderDetailPanel
                    ? enableExpandAll
                        ? 60
                        : 70
                    : 100,
            tableOptions,
        }),
    };
};

const getMRT_RowNumbersColumnDef = (tableOptions) => {
    const { localization, rowNumberDisplayMode } = tableOptions;
    const { pagination: { pageIndex, pageSize }, } = tableOptions.state;
    return {
        Cell: ({ renderedRowIndex = 0, row }) => ((rowNumberDisplayMode === "static"
            ? renderedRowIndex + pageSize * pageIndex
            : row.index) ?? 0) + 1,
        grow: false,
        Header: () => localization.rowNumber,
        ...defaultDisplayColumnProps({
            header: "rowNumbers",
            id: "mrt-row-numbers",
            size: 50,
            tableOptions,
        }),
    };
};

const getMRT_RowPinningColumnDef = (tableOptions) => {
    return {
        Cell: ({ row, table }) => (jsxRuntime.jsx(MRT_TableBodyRowPinButton, { row: row, table: table })),
        grow: false,
        ...defaultDisplayColumnProps({
            header: "pin",
            id: "mrt-row-pin",
            size: 60,
            tableOptions,
        }),
    };
};

const getMRT_RowSelectColumnDef = (tableOptions) => {
    const { enableMultiRowSelection, enableSelectAll } = tableOptions;
    return {
        Cell: ({ renderedRowIndex, row, table }) => (jsxRuntime.jsx(MRT_SelectCheckbox, { renderedRowIndex: renderedRowIndex, row: row, table: table })),
        grow: false,
        Header: enableSelectAll && enableMultiRowSelection
            ? ({ table }) => jsxRuntime.jsx(MRT_SelectCheckbox, { table: table })
            : undefined,
        ...defaultDisplayColumnProps({
            header: "select",
            id: "mrt-row-select",
            size: enableSelectAll ? 60 : 70,
            tableOptions,
        }),
    };
};

const MRT_AggregationFns = { ...reactTable.aggregationFns };

const MRT_Default_Icons = {
    IconArrowAutofitContent: iconsReact.IconArrowAutofitContent,
    IconArrowsSort: iconsReact.IconArrowsSort,
    IconBaselineDensityLarge: iconsReact.IconBaselineDensityLarge,
    IconBaselineDensityMedium: iconsReact.IconBaselineDensityMedium,
    IconBaselineDensitySmall: iconsReact.IconBaselineDensitySmall,
    IconBoxMultiple: iconsReact.IconBoxMultiple,
    IconChevronDown: iconsReact.IconChevronDown,
    IconChevronLeft: iconsReact.IconChevronLeft,
    IconChevronLeftPipe: iconsReact.IconChevronLeftPipe,
    IconChevronRight: iconsReact.IconChevronRight,
    IconChevronRightPipe: iconsReact.IconChevronRightPipe,
    IconChevronsDown: iconsReact.IconChevronsDown,
    IconCircleX: iconsReact.IconCircleX,
    IconClearAll: iconsReact.IconClearAll,
    IconColumns: iconsReact.IconColumns,
    IconDeviceFloppy: iconsReact.IconDeviceFloppy,
    IconDots: iconsReact.IconDots,
    IconDotsVertical: iconsReact.IconDotsVertical,
    IconEdit: iconsReact.IconEdit,
    IconEyeOff: iconsReact.IconEyeOff,
    IconFilter: iconsReact.IconFilter,
    IconFilterCog: iconsReact.IconFilterCog,
    IconFilterOff: iconsReact.IconFilterOff,
    IconGripHorizontal: iconsReact.IconGripHorizontal,
    IconMaximize: iconsReact.IconMaximize,
    IconMinimize: iconsReact.IconMinimize,
    IconPinned: iconsReact.IconPinned,
    IconPinnedOff: iconsReact.IconPinnedOff,
    IconSearch: iconsReact.IconSearch,
    IconSearchOff: iconsReact.IconSearchOff,
    IconSortAscending: iconsReact.IconSortAscending,
    IconSortDescending: iconsReact.IconSortDescending,
    IconX: iconsReact.IconX,
};

const MRT_Localization_EN = {
    actions: "Actions",
    and: "and",
    cancel: "Cancel",
    changeFilterMode: "Change filter mode",
    changeSearchMode: "Change search mode",
    clearFilter: "Clear filter",
    clearSearch: "Clear search",
    clearSelection: "Clear selection",
    clearSort: "Clear sort",
    clickToCopy: "Click to copy",
    copy: "Copy",
    collapse: "Collapse",
    collapseAll: "Collapse all",
    columnActions: "Column Actions",
    copiedToClipboard: "Copied to clipboard",
    dropToGroupBy: "Drop to group by {column}",
    edit: "Edit",
    expand: "Expand",
    expandAll: "Expand all",
    filterArrIncludes: "Includes",
    filterArrIncludesAll: "Includes all",
    filterArrIncludesSome: "Includes",
    filterBetween: "Between",
    filterBetweenInclusive: "Between Inclusive",
    filterByColumn: "Filter by {column}",
    filterContains: "Contains",
    filterEmpty: "Empty",
    filterEndsWith: "Ends With",
    filterEquals: "Equals",
    filterEqualsString: "Equals",
    filterFuzzy: "Fuzzy",
    filterGreaterThan: "Greater Than",
    filterGreaterThanOrEqualTo: "Greater Than Or Equal To",
    filterInNumberRange: "Between",
    filterIncludesString: "Contains",
    filterIncludesStringSensitive: "Contains",
    filterLessThan: "Less Than",
    filterLessThanOrEqualTo: "Less Than Or Equal To",
    filterMode: "Filter Mode: {filterType}",
    filterNotEmpty: "Not Empty",
    filterNotEquals: "Not Equals",
    filterStartsWith: "Starts With",
    filterWeakEquals: "Equals",
    filteringByColumn: "Filtering by {column} - {filterType} {filterValue}",
    goToFirstPage: "Go to first page",
    goToLastPage: "Go to last page",
    goToNextPage: "Go to next page",
    goToPreviousPage: "Go to previous page",
    grab: "Grab",
    groupByColumn: "Group by {column}",
    groupedBy: "Grouped by ",
    hideAll: "Hide all",
    hideColumn: "Hide {column} column",
    max: "Max",
    min: "Min",
    move: "Move",
    noRecordsToDisplay: "No records to display",
    noResultsFound: "No results found",
    of: "of",
    or: "or",
    pin: "Pin",
    pinToLeft: "Pin to left",
    pinToRight: "Pin to right",
    resetColumnSize: "Reset column size",
    resetOrder: "Reset order",
    rowActions: "Row Actions",
    rowNumber: "#",
    rowNumbers: "Row Numbers",
    rowsPerPage: "Rows per page",
    save: "Save",
    search: "Search",
    selectedCountOfRowCountRowsSelected: "{selectedCount} of {rowCount} row(s) selected",
    select: "Select",
    showAll: "Show all",
    showAllColumns: "Show all columns",
    showHideColumns: "Show/Hide columns",
    showHideFilters: "Show/Hide filters",
    showHideSearch: "Show/Hide search",
    sortByColumnAsc: "Sort by {column} ascending",
    sortByColumnDesc: "Sort by {column} descending",
    sortedByColumnAsc: "Sorted by {column} ascending",
    sortedByColumnDesc: "Sorted by {column} descending",
    thenBy: ", then by ",
    toggleDensity: "Toggle density",
    toggleFullScreen: "Toggle full screen",
    toggleSelectAll: "Toggle select all",
    toggleSelectRow: "Toggle select row",
    toggleVisibility: "Toggle visibility",
    ungroupByColumn: "Ungroup by {column}",
    unpin: "Unpin",
    unpinAll: "Unpin all",
};

const MRT_DefaultColumn = {
    filterVariant: "text",
    maxSize: 1000,
    minSize: 40,
    size: 180,
};
const MRT_DefaultDisplayColumn = {
    columnDefType: "display",
    enableClickToCopy: false,
    enableColumnActions: false,
    enableColumnDragging: false,
    enableColumnFilter: false,
    enableColumnOrdering: false,
    enableEditing: false,
    enableGlobalFilter: false,
    enableGrouping: false,
    enableHiding: false,
    enableResizing: false,
    enableSorting: false,
};
const useMRT_TableOptions = ({ aggregationFns, autoResetExpanded = false, columnFilterDisplayMode = "subheader", columnResizeDirection, columnResizeMode = "onChange", createDisplayMode = "modal", defaultColumn, defaultDisplayColumn, editDisplayMode = "modal", enableBatchRowSelection = true, enableBottomToolbar = true, enableColumnActions = true, enableColumnFilters = true, enableColumnOrdering = false, enableColumnPinning = false, enableColumnResizing = false, enableColumnVirtualization, enableDensityToggle = true, enableExpandAll = true, enableExpanding, enableFacetedValues = false, enableFilterMatchHighlighting = true, enableFilters = true, enableFullScreenToggle = true, enableGlobalFilter = true, enableGlobalFilterRankedResults = true, enableGrouping = false, enableHeaderActionsHoverReveal = false, enableHiding = true, enableMultiRowSelection = true, enableMultiSort = true, enablePagination = true, enableRowPinning = false, enableRowSelection = false, enableRowVirtualization, enableSelectAll = true, enableSorting = true, enableStickyHeader = false, enableTableFooter = true, enableTableHead = true, enableToolbarInternalActions = true, enableTopToolbar = true, filterFns, icons, layoutMode, localization, manualFiltering, manualGrouping, manualPagination, manualSorting, paginationDisplayMode = "default", positionActionsColumn = "first", positionCreatingRow = "top", positionExpandColumn = "first", positionGlobalFilter = "right", positionPagination = "bottom", positionToolbarAlertBanner = "top", positionToolbarDropZone = "top", rowNumberDisplayMode = "static", rowPinningDisplayMode = "sticky", selectAllMode = "page", sortingFns, ...rest }) => {
    const direction = core.useDirection();
    icons = react.useMemo(() => ({ ...MRT_Default_Icons, ...icons }), [icons]);
    localization = react.useMemo(() => ({
        ...MRT_Localization_EN,
        ...localization,
    }), [localization]);
    aggregationFns = react.useMemo(() => ({ ...MRT_AggregationFns, ...aggregationFns }), []);
    filterFns = react.useMemo(() => ({ ...MRT_FilterFns, ...filterFns }), []);
    sortingFns = react.useMemo(() => ({ ...MRT_SortingFns, ...sortingFns }), []);
    defaultColumn = react.useMemo(() => ({ ...MRT_DefaultColumn, ...defaultColumn }), [defaultColumn]);
    defaultDisplayColumn = react.useMemo(() => ({
        ...MRT_DefaultDisplayColumn,
        ...defaultDisplayColumn,
    }), [defaultDisplayColumn]);
    //cannot be changed after initialization
    [enableColumnVirtualization, enableRowVirtualization] = react.useMemo(() => [enableColumnVirtualization, enableRowVirtualization], []);
    if (!columnResizeDirection) {
        columnResizeDirection = direction.dir || "ltr";
    }
    layoutMode =
        layoutMode || (enableColumnResizing ? "grid-no-grow" : "semantic");
    if (layoutMode === "semantic" &&
        (enableRowVirtualization || enableColumnVirtualization)) {
        layoutMode = "grid";
    }
    if (enableRowVirtualization) {
        enableStickyHeader = true;
    }
    if (enablePagination === false && manualPagination === undefined) {
        manualPagination = true;
    }
    if (!rest.data?.length) {
        manualFiltering = true;
        manualGrouping = true;
        manualPagination = true;
        manualSorting = true;
    }
    return {
        aggregationFns,
        autoResetExpanded,
        columnFilterDisplayMode,
        columnResizeDirection,
        columnResizeMode,
        createDisplayMode,
        defaultColumn,
        defaultDisplayColumn,
        editDisplayMode,
        enableBatchRowSelection,
        enableBottomToolbar,
        enableColumnActions,
        enableColumnFilters,
        enableColumnOrdering,
        enableColumnPinning,
        enableColumnResizing,
        enableColumnVirtualization,
        enableDensityToggle,
        enableExpandAll,
        enableExpanding,
        enableFacetedValues,
        enableFilterMatchHighlighting,
        enableFilters,
        enableFullScreenToggle,
        enableGlobalFilter,
        enableGlobalFilterRankedResults,
        enableGrouping,
        enableHeaderActionsHoverReveal,
        enableHiding,
        enableMultiRowSelection,
        enableMultiSort,
        enablePagination,
        enableRowPinning,
        enableRowSelection,
        enableRowVirtualization,
        enableSelectAll,
        enableSorting,
        enableStickyHeader,
        enableTableFooter,
        enableTableHead,
        enableToolbarInternalActions,
        enableTopToolbar,
        filterFns,
        getCoreRowModel: reactTable.getCoreRowModel(),
        getExpandedRowModel: enableExpanding || enableGrouping ? reactTable.getExpandedRowModel() : undefined,
        getFacetedMinMaxValues: enableFacetedValues
            ? reactTable.getFacetedMinMaxValues()
            : undefined,
        getFacetedRowModel: enableFacetedValues ? reactTable.getFacetedRowModel() : undefined,
        getFacetedUniqueValues: enableFacetedValues
            ? reactTable.getFacetedUniqueValues()
            : undefined,
        getFilteredRowModel: enableColumnFilters || enableGlobalFilter || enableFilters
            ? reactTable.getFilteredRowModel()
            : undefined,
        getGroupedRowModel: enableGrouping ? reactTable.getGroupedRowModel() : undefined,
        getPaginationRowModel: enablePagination
            ? reactTable.getPaginationRowModel()
            : undefined,
        getSortedRowModel: enableSorting ? reactTable.getSortedRowModel() : undefined,
        getSubRows: (row) => row?.subRows,
        icons,
        layoutMode,
        localization,
        manualFiltering,
        manualGrouping,
        manualPagination,
        manualSorting,
        paginationDisplayMode,
        positionActionsColumn,
        positionCreatingRow,
        positionExpandColumn,
        positionGlobalFilter,
        positionPagination,
        positionToolbarAlertBanner,
        positionToolbarDropZone,
        rowNumberDisplayMode,
        rowPinningDisplayMode,
        selectAllMode,
        sortingFns,
        ...rest,
    };
};

const blankColProps = {
    children: null,
    style: {
        minWidth: 0,
        padding: 0,
        width: 0,
    },
};
const getMRT_RowSpacerColumnDef = (tableOptions) => {
    return {
        ...defaultDisplayColumnProps({
            id: "mrt-row-spacer",
            size: 0,
            tableOptions,
        }),
        grow: true,
        ...MRT_DefaultDisplayColumn,
        mantineTableBodyCellProps: blankColProps,
        mantineTableFooterCellProps: blankColProps,
        mantineTableHeadCellProps: blankColProps,
    };
};

const useMRT_Effects = (table) => {
    const { getIsSomeRowsPinned, getPrePaginationRowModel, getState, options: { enablePagination, enableRowPinning, rowCount }, } = table;
    const { columnOrder, density, globalFilter, isFullScreen, isLoading, pagination, showSkeletons, sorting, } = getState();
    const totalColumnCount = table.options.columns.length;
    const totalRowCount = rowCount ?? getPrePaginationRowModel().rows.length;
    const rerender = react.useReducer(() => ({}), {})[1];
    const initialBodyHeight = react.useRef(undefined);
    const previousTop = react.useRef(undefined);
    react.useEffect(() => {
        if (typeof window !== "undefined") {
            initialBodyHeight.current = document.body.style.height;
        }
    }, []);
    //hide scrollbars when table is in full screen mode, preserve body scroll position after full screen exit
    react.useEffect(() => {
        if (typeof window !== "undefined") {
            if (isFullScreen) {
                previousTop.current = document.body.getBoundingClientRect().top; //save scroll position
                document.body.style.height = "100dvh"; //hide page scrollbars when table is in full screen mode
            }
            else {
                document.body.style.height = initialBodyHeight.current;
                if (!previousTop.current)
                    return;
                //restore scroll position
                window.scrollTo({
                    behavior: "instant",
                    top: -1 * previousTop.current,
                });
            }
        }
    }, [isFullScreen]);
    //recalculate column order when columns change or features are toggled on/off
    react.useEffect(() => {
        if (totalColumnCount !== columnOrder.length) {
            table.setColumnOrder(getDefaultColumnOrderIds(table.options));
        }
    }, [totalColumnCount]);
    //if page index is out of bounds, set it to the last page
    react.useEffect(() => {
        if (!enablePagination || isLoading || showSkeletons)
            return;
        const { pageIndex, pageSize } = pagination;
        const firstVisibleRowIndex = pageIndex * pageSize;
        if (firstVisibleRowIndex >= totalRowCount && firstVisibleRowIndex > 0) {
            table.setPageIndex(Math.ceil(totalRowCount / pageSize) - 1);
        }
    }, [totalRowCount]);
    //turn off sort when global filter is looking for ranked results
    const appliedSort = react.useRef(sorting);
    react.useEffect(() => {
        if (sorting.length) {
            appliedSort.current = sorting;
        }
    }, [sorting]);
    react.useEffect(() => {
        if (!getCanRankRows(table))
            return;
        if (globalFilter) {
            table.setSorting([]);
        }
        else {
            table.setSorting(() => appliedSort.current || []);
        }
    }, [globalFilter]);
    //fix pinned row top style when density changes
    react.useEffect(() => {
        if (enableRowPinning && getIsSomeRowsPinned()) {
            setTimeout(() => {
                rerender();
            }, 150);
        }
    }, [density]);
};

/**
 * The MRT hook that wraps the TanStack useReactTable hook and adds additional functionality
 * @param definedTableOptions - table options with proper defaults set
 * @returns the MRT table instance
 */
const useMRT_TableInstance = (definedTableOptions) => {
    const lastSelectedRowId = react.useRef(null);
    const bottomToolbarRef = react.useRef(null);
    const editInputRefs = react.useRef({});
    const filterInputRefs = react.useRef({});
    const searchInputRef = react.useRef(null);
    const tableContainerRef = react.useRef(null);
    const tableHeadCellRefs = react.useRef({});
    const tablePaperRef = react.useRef(null);
    const topToolbarRef = react.useRef(null);
    const tableHeadRef = react.useRef(null);
    const tableFooterRef = react.useRef(null);
    //transform initial state with proper column order
    const initialState = react.useMemo(() => {
        const initState = definedTableOptions.initialState ?? {};
        initState.columnOrder =
            initState.columnOrder ??
                getDefaultColumnOrderIds({
                    ...definedTableOptions,
                    state: {
                        ...definedTableOptions.initialState,
                        ...definedTableOptions.state,
                    },
                });
        initState.globalFilterFn = definedTableOptions.globalFilterFn ?? "fuzzy";
        return initState;
    }, []);
    definedTableOptions.initialState = initialState;
    const [creatingRow, _setCreatingRow] = react.useState(initialState.creatingRow ?? null);
    const [columnFilterFns, setColumnFilterFns] = react.useState(() => Object.assign({}, ...getAllLeafColumnDefs(definedTableOptions.columns).map((col) => ({
        [getColumnId(col)]: col.filterFn instanceof Function
            ? (col.filterFn.name ?? "custom")
            : (col.filterFn ??
                initialState?.columnFilterFns?.[getColumnId(col)] ??
                getDefaultColumnFilterFn(col)),
    }))));
    const [columnOrder, onColumnOrderChange] = react.useState(initialState.columnOrder ?? []);
    const [columnSizingInfo, onColumnSizingInfoChange] = react.useState(initialState.columnSizingInfo ?? {});
    const [density, setDensity] = react.useState(initialState?.density ?? "md");
    const [draggingColumn, setDraggingColumn] = react.useState(initialState.draggingColumn ?? null);
    const [draggingRow, setDraggingRow] = react.useState(initialState.draggingRow ?? null);
    const [editingCell, setEditingCell] = react.useState(initialState.editingCell ?? null);
    const [editingRow, setEditingRow] = react.useState(initialState.editingRow ?? null);
    const [globalFilterFn, setGlobalFilterFn] = react.useState(initialState.globalFilterFn ?? "fuzzy");
    const [grouping, onGroupingChange] = react.useState(initialState.grouping ?? []);
    const [hoveredColumn, setHoveredColumn] = react.useState(initialState.hoveredColumn ?? null);
    const [hoveredRow, setHoveredRow] = react.useState(initialState.hoveredRow ?? null);
    const [isFullScreen, setIsFullScreen] = react.useState(initialState?.isFullScreen ?? false);
    const [pagination, onPaginationChange] = react.useState(initialState?.pagination ?? { pageIndex: 0, pageSize: 10 });
    const [showAlertBanner, setShowAlertBanner] = react.useState(initialState?.showAlertBanner ?? false);
    const [showColumnFilters, setShowColumnFilters] = react.useState(initialState?.showColumnFilters ?? false);
    const [showGlobalFilter, setShowGlobalFilter] = react.useState(initialState?.showGlobalFilter ?? false);
    const [showToolbarDropZone, setShowToolbarDropZone] = react.useState(initialState?.showToolbarDropZone ?? false);
    definedTableOptions.state = {
        columnFilterFns,
        columnOrder,
        columnSizingInfo,
        creatingRow,
        density,
        draggingColumn,
        draggingRow,
        editingCell,
        editingRow,
        globalFilterFn,
        grouping,
        hoveredColumn,
        hoveredRow,
        isFullScreen,
        pagination,
        showAlertBanner,
        showColumnFilters,
        showGlobalFilter,
        showToolbarDropZone,
        ...definedTableOptions.state,
    };
    //The table options now include all state needed to help determine column visibility and order logic
    const statefulTableOptions = definedTableOptions;
    //don't recompute columnDefs while resizing column or dragging column/row
    const columnDefsRef = react.useRef([]);
    statefulTableOptions.columns =
        statefulTableOptions.state.columnSizingInfo.isResizingColumn ||
            statefulTableOptions.state.draggingColumn ||
            statefulTableOptions.state.draggingRow
            ? columnDefsRef.current
            : prepareColumns({
                columnDefs: [
                    ...[
                        showRowPinningColumn(statefulTableOptions) &&
                            getMRT_RowPinningColumnDef(statefulTableOptions),
                        showRowDragColumn(statefulTableOptions) &&
                            getMRT_RowDragColumnDef(statefulTableOptions),
                        showRowActionsColumn(statefulTableOptions) &&
                            getMRT_RowActionsColumnDef(statefulTableOptions),
                        showRowExpandColumn(statefulTableOptions) &&
                            getMRT_RowExpandColumnDef(statefulTableOptions),
                        showRowSelectionColumn(statefulTableOptions) &&
                            getMRT_RowSelectColumnDef(statefulTableOptions),
                        showRowNumbersColumn(statefulTableOptions) &&
                            getMRT_RowNumbersColumnDef(statefulTableOptions),
                    ].filter(Boolean),
                    ...statefulTableOptions.columns,
                    ...[
                        showRowSpacerColumn(statefulTableOptions) &&
                            getMRT_RowSpacerColumnDef(statefulTableOptions),
                    ].filter(Boolean),
                ],
                tableOptions: statefulTableOptions,
            });
    columnDefsRef.current = statefulTableOptions.columns;
    //if loading, generate blank rows to show skeleton loaders
    statefulTableOptions.data = react.useMemo(() => (statefulTableOptions.state.isLoading ||
        statefulTableOptions.state.showSkeletons) &&
        !statefulTableOptions.data.length
        ? [
            ...Array(Math.min(statefulTableOptions.state.pagination.pageSize, 20)).fill(null),
        ].map(() => Object.assign({}, ...getAllLeafColumnDefs(statefulTableOptions.columns).map((col) => ({
            [getColumnId(col)]: null,
        }))))
        : statefulTableOptions.data, [
        statefulTableOptions.data,
        statefulTableOptions.state.isLoading,
        statefulTableOptions.state.showSkeletons,
    ]);
    //@ts-expect-error
    const table = reactTable.useReactTable({
        onColumnOrderChange,
        onColumnSizingInfoChange,
        onGroupingChange,
        onPaginationChange,
        ...statefulTableOptions,
        globalFilterFn: statefulTableOptions.filterFns?.[globalFilterFn ?? "fuzzy"],
    });
    table.refs = {
        bottomToolbarRef,
        editInputRefs,
        filterInputRefs,
        lastSelectedRowId,
        searchInputRef,
        tableContainerRef,
        tableFooterRef,
        tableHeadCellRefs,
        tableHeadRef,
        tablePaperRef,
        topToolbarRef,
    };
    table.setCreatingRow = (row) => {
        let _row = row;
        if (row === true) {
            _row = createRow(table);
        }
        if (statefulTableOptions?.onCreatingRowChange) {
            statefulTableOptions.onCreatingRowChange(_row);
        }
        else {
            _setCreatingRow(_row);
        }
    };
    table.setColumnFilterFns =
        statefulTableOptions.onColumnFilterFnsChange ?? setColumnFilterFns;
    table.setDensity = statefulTableOptions.onDensityChange ?? setDensity;
    table.setDraggingColumn =
        statefulTableOptions.onDraggingColumnChange ?? setDraggingColumn;
    table.setDraggingRow =
        statefulTableOptions.onDraggingRowChange ?? setDraggingRow;
    table.setEditingCell =
        statefulTableOptions.onEditingCellChange ?? setEditingCell;
    table.setEditingRow =
        statefulTableOptions.onEditingRowChange ?? setEditingRow;
    table.setGlobalFilterFn =
        statefulTableOptions.onGlobalFilterFnChange ?? setGlobalFilterFn;
    table.setHoveredColumn =
        statefulTableOptions.onHoveredColumnChange ?? setHoveredColumn;
    table.setHoveredRow =
        statefulTableOptions.onHoveredRowChange ?? setHoveredRow;
    table.setIsFullScreen =
        statefulTableOptions.onIsFullScreenChange ?? setIsFullScreen;
    table.setShowAlertBanner =
        statefulTableOptions.onShowAlertBannerChange ?? setShowAlertBanner;
    table.setShowColumnFilters =
        statefulTableOptions.onShowColumnFiltersChange ?? setShowColumnFilters;
    table.setShowGlobalFilter =
        statefulTableOptions.onShowGlobalFilterChange ?? setShowGlobalFilter;
    table.setShowToolbarDropZone =
        statefulTableOptions.onShowToolbarDropZoneChange ?? setShowToolbarDropZone;
    useMRT_Effects(table);
    return table;
};

const useMantineReactTable = (tableOptions) => useMRT_TableInstance(useMRT_TableOptions(tableOptions));

var commonClasses = {"common-toolbar-styles":"common-styles-module_common-toolbar-styles__DnjR8"};

var classes$8 = {"root":"MRT_BottomToolbar-module_root__VDeWo","root-fullscreen":"MRT_BottomToolbar-module_root-fullscreen__esE15","custom-toolbar-container":"MRT_BottomToolbar-module_custom-toolbar-container__XcDRF","paginator-container":"MRT_BottomToolbar-module_paginator-container__A3eWY","paginator-container-alert-banner":"MRT_BottomToolbar-module_paginator-container-alert-banner__gyqtO"};

var classes$7 = {"collapse":"MRT_ProgressBar-module_collapse__rOLJH","collapse-top":"MRT_ProgressBar-module_collapse-top__oCi0h"};

const MRT_ProgressBar = ({ isTopToolbar, table, ...rest }) => {
    const { getState, options: { mantineProgressProps }, } = table;
    const { isSaving, showProgressBars } = getState();
    const linearProgressProps = {
        ...parseFromValuesOrFunc(mantineProgressProps, {
            isTopToolbar,
            table,
        }),
        ...rest,
    };
    return (jsxRuntime.jsx(core.Collapse, { className: clsx(classes$7.collapse, isTopToolbar && classes$7["collapse-top"]), in: isSaving || showProgressBars, children: jsxRuntime.jsx(core.Progress, { animated: true, "aria-busy": "true", "aria-label": "Loading", radius: 0, value: 100, ...linearProgressProps }) }));
};

var classes$6 = {"root":"MRT_TablePagination-module_root__yZ8pm","pagesize":"MRT_TablePagination-module_pagesize__-vmTn","with-top-margin":"MRT_TablePagination-module_with-top-margin__aM5-m"};

const defaultRowsPerPage = [5, 10, 15, 20, 25, 30, 50, 100].map((x) => x.toString());
const MRT_TablePagination = ({ position = "bottom", table, ...props }) => {
    const { getPrePaginationRowModel, getState, options: { enableToolbarInternalActions, icons: { IconChevronLeft, IconChevronLeftPipe, IconChevronRight, IconChevronRightPipe, }, localization, mantinePaginationProps, paginationDisplayMode, rowCount, }, setPageIndex, setPageSize, } = table;
    const { pagination: { pageIndex = 0, pageSize = 10 }, showGlobalFilter, } = getState();
    const paginationProps = {
        ...parseFromValuesOrFunc(mantinePaginationProps, {
            table,
        }),
        ...props,
    };
    const totalRowCount = rowCount ?? getPrePaginationRowModel().rows.length;
    const numberOfPages = Math.ceil(totalRowCount / pageSize);
    const showFirstLastPageButtons = numberOfPages > 2;
    const firstRowIndex = pageIndex * pageSize;
    const lastRowIndex = Math.min(pageIndex * pageSize + pageSize, totalRowCount);
    const { rowsPerPageOptions = defaultRowsPerPage, showRowsPerPage = true, withEdges = showFirstLastPageButtons, ...rest } = paginationProps ?? {};
    const needsTopMargin = position === "top" && enableToolbarInternalActions && !showGlobalFilter;
    return (jsxRuntime.jsxs(core.Box, { className: clsx("mrt-table-pagination", classes$6.root, needsTopMargin && classes$6["with-top-margin"]), children: [paginationProps?.showRowsPerPage !== false && (jsxRuntime.jsxs(core.Group, { gap: "xs", children: [jsxRuntime.jsx(core.Text, { id: "rpp-label", children: localization.rowsPerPage }), jsxRuntime.jsx(core.Select, { allowDeselect: false, "aria-labelledby": "rpp-label", className: classes$6.pagesize, data: paginationProps?.rowsPerPageOptions ?? defaultRowsPerPage, onChange: (value) => setPageSize(+value), value: pageSize.toString() })] })), paginationDisplayMode === "pages" ? (jsxRuntime.jsx(core.Pagination, { firstIcon: IconChevronLeftPipe, lastIcon: IconChevronRightPipe, nextIcon: IconChevronRight, onChange: (newPageIndex) => setPageIndex(newPageIndex - 1), previousIcon: IconChevronLeft, total: numberOfPages, value: pageIndex + 1, withEdges: withEdges, ...rest })) : paginationDisplayMode === "default" ? (jsxRuntime.jsxs(jsxRuntime.Fragment, { children: [jsxRuntime.jsx(core.Text, { children: `${lastRowIndex === 0 ? 0 : (firstRowIndex + 1).toLocaleString()}-${lastRowIndex.toLocaleString()} ${localization.of} ${totalRowCount.toLocaleString()}` }), jsxRuntime.jsxs(core.Group, { gap: 6, children: [withEdges && (jsxRuntime.jsx(core.ActionIcon, { "aria-label": localization.goToFirstPage, color: "gray", disabled: pageIndex <= 0, onClick: () => setPageIndex(0), variant: "subtle", children: jsxRuntime.jsx(IconChevronLeftPipe, {}) })), jsxRuntime.jsx(core.ActionIcon, { "aria-label": localization.goToPreviousPage, color: "gray", disabled: pageIndex <= 0, onClick: () => setPageIndex(pageIndex - 1), variant: "subtle", children: jsxRuntime.jsx(IconChevronLeft, {}) }), jsxRuntime.jsx(core.ActionIcon, { "aria-label": localization.goToNextPage, color: "gray", disabled: lastRowIndex >= totalRowCount, onClick: () => setPageIndex(pageIndex + 1), variant: "subtle", children: jsxRuntime.jsx(IconChevronRight, {}) }), withEdges && (jsxRuntime.jsx(core.ActionIcon, { "aria-label": localization.goToLastPage, color: "gray", disabled: lastRowIndex >= totalRowCount, onClick: () => setPageIndex(numberOfPages - 1), variant: "subtle", children: jsxRuntime.jsx(IconChevronRightPipe, {}) }))] })] })) : null] }));
};

var classes$5 = {"root":"MRT_ToolbarDropZone-module_root__eGTXb","hovered":"MRT_ToolbarDropZone-module_hovered__g7PeJ"};

const MRT_ToolbarDropZone = ({ table, ...rest }) => {
    const { getState, options: { enableGrouping, localization }, setHoveredColumn, setShowToolbarDropZone, } = table;
    const { draggingColumn, grouping, hoveredColumn, showToolbarDropZone } = getState();
    const handleDragEnter = (_event) => {
        setHoveredColumn({ id: "drop-zone" });
    };
    react.useEffect(() => {
        if (table.options.state?.showToolbarDropZone !== undefined) {
            setShowToolbarDropZone(!!enableGrouping &&
                !!draggingColumn &&
                draggingColumn.columnDef.enableGrouping !== false &&
                !grouping.includes(draggingColumn.id));
        }
    }, [enableGrouping, draggingColumn, grouping]);
    return (jsxRuntime.jsx(core.Transition, { mounted: showToolbarDropZone, transition: "fade", children: () => (jsxRuntime.jsx(core.Flex, { className: clsx("mrt-toolbar-dropzone", classes$5.root, hoveredColumn?.id === "drop-zone" && classes$5.hovered), onDragEnter: handleDragEnter, ...rest, children: jsxRuntime.jsx(core.Text, { children: localization.dropToGroupBy.replace("{column}", draggingColumn?.columnDef?.header ?? "") }) })) }));
};

const MRT_BottomToolbar = ({ table, ...rest }) => {
    const { getState, options: { enablePagination, mantineBottomToolbarProps, positionPagination, positionToolbarAlertBanner, positionToolbarDropZone, renderBottomToolbarCustomActions, }, refs: { bottomToolbarRef }, } = table;
    const { isFullScreen } = getState();
    const isMobile = hooks.useMediaQuery("(max-width: 720px)");
    const toolbarProps = {
        ...parseFromValuesOrFunc(mantineBottomToolbarProps, {
            table,
        }),
        ...rest,
    };
    const stackAlertBanner = isMobile || !!renderBottomToolbarCustomActions;
    return (jsxRuntime.jsxs(core.Box, { ...toolbarProps, className: clsx("mrt-bottom-toolbar", classes$8.root, commonClasses["common-toolbar-styles"], isFullScreen && classes$8["root-fullscreen"], toolbarProps?.className), ref: (node) => {
            if (node) {
                bottomToolbarRef.current = node;
                if (toolbarProps?.ref) {
                    toolbarProps.ref.current = node;
                }
            }
        }, children: [jsxRuntime.jsx(MRT_ProgressBar, { isTopToolbar: false, table: table }), positionToolbarAlertBanner === "bottom" && (jsxRuntime.jsx(MRT_ToolbarAlertBanner, { stackAlertBanner: stackAlertBanner, table: table })), ["both", "bottom"].includes(positionToolbarDropZone ?? "") && (jsxRuntime.jsx(MRT_ToolbarDropZone, { table: table })), jsxRuntime.jsxs(core.Box, { className: classes$8["custom-toolbar-container"], children: [renderBottomToolbarCustomActions ? (renderBottomToolbarCustomActions({ table })) : (jsxRuntime.jsx("span", {})), jsxRuntime.jsx(core.Box, { className: clsx(classes$8["paginator-container"], stackAlertBanner && classes$8["paginator-container-alert-banner"]), children: enablePagination &&
                            ["both", "bottom"].includes(positionPagination ?? "") && (jsxRuntime.jsx(MRT_TablePagination, { position: "bottom", table: table })) })] })] }));
};

var classes$4 = {"root":"MRT_ToolbarInternalButtons-module_root__NKoUG"};

const MRT_ToolbarInternalButtons = ({ table, ...rest }) => {
    const { options: { columnFilterDisplayMode, enableColumnFilters, enableColumnOrdering, enableColumnPinning, enableDensityToggle, enableFilters, enableFullScreenToggle, enableGlobalFilter, enableHiding, initialState, renderToolbarInternalActions, }, } = table;
    return (jsxRuntime.jsx(core.Flex, { ...rest, className: clsx("mrt-toolbar-internal-buttons", classes$4.root, rest?.className), children: renderToolbarInternalActions?.({ table }) ?? (jsxRuntime.jsxs(jsxRuntime.Fragment, { children: [enableFilters &&
                    enableGlobalFilter &&
                    !initialState?.showGlobalFilter && (jsxRuntime.jsx(MRT_ToggleGlobalFilterButton, { table: table })), enableFilters &&
                    enableColumnFilters &&
                    columnFilterDisplayMode !== "popover" && (jsxRuntime.jsx(MRT_ToggleFiltersButton, { table: table })), (enableHiding || enableColumnOrdering || enableColumnPinning) && (jsxRuntime.jsx(MRT_ShowHideColumnsButton, { table: table })), enableDensityToggle && (jsxRuntime.jsx(MRT_ToggleDensePaddingButton, { table: table })), enableFullScreenToggle && (jsxRuntime.jsx(MRT_ToggleFullScreenButton, { table: table }))] })) }));
};

var classes$3 = {"root":"MRT_TopToolbar-module_root__r4-V9","root-fullscreen":"MRT_TopToolbar-module_root-fullscreen__3itT8","actions-container":"MRT_TopToolbar-module_actions-container__-uL0u","actions-container-stack-alert":"MRT_TopToolbar-module_actions-container-stack-alert__OYDL6"};

const MRT_TopToolbar = ({ table, ...rest }) => {
    const { getState, options: { enableGlobalFilter, enablePagination, enableToolbarInternalActions, mantineTopToolbarProps, positionGlobalFilter, positionPagination, positionToolbarAlertBanner, positionToolbarDropZone, renderTopToolbarCustomActions, }, refs: { topToolbarRef }, } = table;
    const { isFullScreen, showGlobalFilter } = getState();
    const isMobile = hooks.useMediaQuery("(max-width:720px)");
    const isTablet = hooks.useMediaQuery("(max-width:1024px)");
    const toolbarProps = {
        ...parseFromValuesOrFunc(mantineTopToolbarProps, { table }),
        ...rest,
    };
    const stackAlertBanner = isMobile ||
        !!renderTopToolbarCustomActions ||
        (showGlobalFilter && isTablet);
    const globalFilterProps = {
        style: !isTablet
            ? {
                zIndex: 3,
            }
            : undefined,
        table,
    };
    return (jsxRuntime.jsxs(core.Box, { ...toolbarProps, className: clsx(commonClasses["common-toolbar-styles"], classes$3["root"], isFullScreen && classes$3["root-fullscreen"], toolbarProps?.className), ref: (node) => {
            if (node) {
                topToolbarRef.current = node;
                if (toolbarProps?.ref) {
                    toolbarProps.ref.current = node;
                }
            }
        }, children: [positionToolbarAlertBanner === "top" && (jsxRuntime.jsx(MRT_ToolbarAlertBanner, { stackAlertBanner: stackAlertBanner, table: table })), ["both", "top"].includes(positionToolbarDropZone ?? "") && (jsxRuntime.jsx(MRT_ToolbarDropZone, { table: table })), jsxRuntime.jsxs(core.Flex, { className: clsx(classes$3["actions-container"], stackAlertBanner && classes$3["actions-container-stack-alert"]), children: [enableGlobalFilter && positionGlobalFilter === "left" && (jsxRuntime.jsx(MRT_GlobalFilterTextInput, { ...globalFilterProps })), renderTopToolbarCustomActions?.({ table }) ?? jsxRuntime.jsx("span", {}), enableToolbarInternalActions ? (jsxRuntime.jsxs(core.Flex, { justify: "end", wrap: "wrap-reverse", children: [enableGlobalFilter && positionGlobalFilter === "right" && (jsxRuntime.jsx(MRT_GlobalFilterTextInput, { ...globalFilterProps })), jsxRuntime.jsx(MRT_ToolbarInternalButtons, { table: table })] })) : (enableGlobalFilter &&
                        positionGlobalFilter === "right" && (jsxRuntime.jsx(MRT_GlobalFilterTextInput, { ...globalFilterProps })))] }), enablePagination &&
                ["both", "top"].includes(positionPagination ?? "") && (jsxRuntime.jsx(core.Flex, { justify: "end", children: jsxRuntime.jsx(MRT_TablePagination, { position: "top", table: table }) })), jsxRuntime.jsx(MRT_ProgressBar, { isTopToolbar: true, table: table })] }));
};

const MRT_EditRowModal = ({ open, table, ...rest }) => {
    const { getState, options: { mantineCreateRowModalProps, mantineEditRowModalProps, onCreatingRowCancel, onEditingRowCancel, renderCreateRowModalContent, renderEditRowModalContent, }, setCreatingRow, setEditingRow, } = table;
    const { creatingRow, editingRow } = getState();
    const row = (creatingRow ?? editingRow);
    const arg = { row, table };
    const modalProps = {
        ...parseFromValuesOrFunc(mantineEditRowModalProps, arg),
        ...(creatingRow && parseFromValuesOrFunc(mantineCreateRowModalProps, arg)),
        ...rest,
    };
    const internalEditComponents = row
        .getAllCells()
        .filter((cell) => cell.column.columnDef.columnDefType === "data")
        .map((cell) => (jsxRuntime.jsx(MRT_EditCellTextInput, { cell: cell, table: table }, cell.id)));
    const handleCancel = () => {
        if (creatingRow) {
            onCreatingRowCancel?.({ row, table });
            setCreatingRow(null);
        }
        else {
            onEditingRowCancel?.({ row, table });
            setEditingRow(null);
        }
        row._valuesCache = {}; //reset values cache
        modalProps.onClose?.();
    };
    return (react.createElement(core.Modal, { opened: open, withCloseButton: false, ...modalProps, key: row.id, onClose: handleCancel }, ((creatingRow &&
        renderCreateRowModalContent?.({
            internalEditComponents,
            row,
            table,
        })) ||
        renderEditRowModalContent?.({
            internalEditComponents,
            row,
            table,
        })) ?? (jsxRuntime.jsxs(jsxRuntime.Fragment, { children: [jsxRuntime.jsx("form", { onSubmit: (e) => e.preventDefault(), children: jsxRuntime.jsx(core.Stack, { gap: "lg", pb: 24, pt: 16, children: internalEditComponents }) }), jsxRuntime.jsx(core.Flex, { justify: "flex-end", children: jsxRuntime.jsx(MRT_EditActionButtons, { row: row, table: table, variant: "text" }) })] }))));
};

const useMRT_ColumnVirtualizer = (table) => {
    const { getLeftLeafColumns, getRightLeafColumns, getState, getVisibleLeafColumns, options: { columnVirtualizerInstanceRef, columnVirtualizerOptions, enableColumnPinning, enableColumnVirtualization, }, refs: { tableContainerRef }, } = table;
    const { columnPinning, draggingColumn } = getState();
    if (!enableColumnVirtualization)
        return undefined;
    const columnVirtualizerProps = parseFromValuesOrFunc(columnVirtualizerOptions, {
        table,
    });
    const visibleColumns = getVisibleLeafColumns();
    const [leftPinnedIndexes, rightPinnedIndexes] = react.useMemo(() => enableColumnPinning
        ? [
            getLeftLeafColumns().map((c) => c.getPinnedIndex()),
            getRightLeafColumns()
                .map((column) => visibleColumns.length - column.getPinnedIndex() - 1)
                .sort((a, b) => a - b),
        ]
        : [[], []], [visibleColumns.length, columnPinning, enableColumnPinning]);
    const numPinnedLeft = leftPinnedIndexes.length;
    const numPinnedRight = rightPinnedIndexes.length;
    const draggingColumnIndex = react.useMemo(() => draggingColumn?.id
        ? visibleColumns.findIndex((c) => c.id === draggingColumn?.id)
        : undefined, [draggingColumn?.id]);
    const columnVirtualizer = reactVirtual.useVirtualizer({
        count: visibleColumns.length,
        estimateSize: (index) => visibleColumns[index].getSize(),
        getScrollElement: () => tableContainerRef.current,
        horizontal: true,
        overscan: 3,
        rangeExtractor: react.useCallback((range) => {
            const newIndexes = extraIndexRangeExtractor(range, draggingColumnIndex);
            if (!numPinnedLeft && !numPinnedRight) {
                return newIndexes;
            }
            return [
                ...new Set([
                    ...leftPinnedIndexes,
                    ...newIndexes,
                    ...rightPinnedIndexes,
                ]),
            ];
        }, [leftPinnedIndexes, rightPinnedIndexes, draggingColumnIndex]),
        ...columnVirtualizerProps,
    });
    const virtualColumns = columnVirtualizer.getVirtualItems();
    columnVirtualizer.virtualColumns = virtualColumns;
    const numColumns = virtualColumns.length;
    if (numColumns) {
        const totalSize = columnVirtualizer.getTotalSize();
        const leftNonPinnedStart = virtualColumns[numPinnedLeft]?.start || 0;
        const leftNonPinnedEnd = virtualColumns[leftPinnedIndexes.length - 1]?.end || 0;
        const rightNonPinnedStart = virtualColumns[numColumns - numPinnedRight]?.start || 0;
        const rightNonPinnedEnd = virtualColumns[numColumns - numPinnedRight - 1]?.end || 0;
        columnVirtualizer.virtualPaddingLeft =
            leftNonPinnedStart - leftNonPinnedEnd;
        columnVirtualizer.virtualPaddingRight =
            totalSize -
                rightNonPinnedEnd -
                (numPinnedRight ? totalSize - rightNonPinnedStart : 0);
    }
    if (columnVirtualizerInstanceRef) {
        //@ts-expect-error
        columnVirtualizerInstanceRef.current = columnVirtualizer;
    }
    return columnVirtualizer;
};

var classes$2 = {"root":"MRT_Table-module_root__ms2uS","root-grid":"MRT_Table-module_root-grid__2Pynz"};

const MRT_Table = ({ table, ...rest }) => {
    const { getFlatHeaders, getState, options: { columns, enableTableFooter, enableTableHead, layoutMode, mantineTableProps, memoMode, }, } = table;
    const { columnSizing, columnSizingInfo, columnVisibility, density } = getState();
    const tableProps = {
        highlightOnHover: true,
        horizontalSpacing: density,
        verticalSpacing: density,
        ...parseFromValuesOrFunc(mantineTableProps, { table }),
        ...rest,
    };
    const columnSizeVars = react.useMemo(() => {
        const headers = getFlatHeaders();
        const colSizes = {};
        for (let i = 0; i < headers.length; i++) {
            const header = headers[i];
            const colSize = header.getSize();
            colSizes[`--header-${parseCSSVarId(header.id)}-size`] = colSize;
            colSizes[`--col-${parseCSSVarId(header.column.id)}-size`] = colSize;
        }
        return colSizes;
    }, [columns, columnSizing, columnSizingInfo, columnVisibility]);
    const columnVirtualizer = useMRT_ColumnVirtualizer(table);
    const commonTableGroupProps = {
        columnVirtualizer,
        table,
    };
    const { colorScheme } = core.useMantineColorScheme();
    const { stripedColor } = tableProps;
    return (jsxRuntime.jsxs(core.Table, { className: clsx("mrt-table", classes$2.root, layoutMode?.startsWith("grid") && classes$2["root-grid"], tableProps.className), ...tableProps, __vars: {
            ...columnSizeVars,
            "--mrt-striped-row-background-color": stripedColor,
            "--mrt-striped-row-hover-background-color": stripedColor
                ? colorScheme === "dark"
                    ? core.lighten(stripedColor, 0.08)
                    : core.darken(stripedColor, 0.12)
                : undefined,
            ...tableProps.__vars,
        }, children: [enableTableHead && jsxRuntime.jsx(MRT_TableHead, { ...commonTableGroupProps }), memoMode === "table-body" || columnSizingInfo.isResizingColumn ? (jsxRuntime.jsx(Memo_MRT_TableBody, { ...commonTableGroupProps, tableProps: tableProps })) : (jsxRuntime.jsx(MRT_TableBody, { ...commonTableGroupProps, tableProps: tableProps })), enableTableFooter && jsxRuntime.jsx(MRT_TableFooter, { ...commonTableGroupProps })] }));
};

var classes$1 = {"root":"MRT_TableContainer-module_root__JIsGB","root-sticky":"MRT_TableContainer-module_root-sticky__uC4qx","root-fullscreen":"MRT_TableContainer-module_root-fullscreen__aM8Jg"};

const useIsomorphicLayoutEffect = typeof window !== "undefined" ? react.useLayoutEffect : react.useEffect;
const MRT_TableContainer = ({ table, ...rest }) => {
    const { getState, options: { createDisplayMode, editDisplayMode, enableStickyHeader, mantineLoadingOverlayProps, mantineTableContainerProps, }, refs: { bottomToolbarRef, tableContainerRef, topToolbarRef }, } = table;
    const { creatingRow, editingRow, isFullScreen, isLoading, showLoadingOverlay, } = getState();
    const [totalToolbarHeight, setTotalToolbarHeight] = react.useState(0);
    const tableContainerProps = {
        ...parseFromValuesOrFunc(mantineTableContainerProps, { table }),
        ...rest,
    };
    const loadingOverlayProps = parseFromValuesOrFunc(mantineLoadingOverlayProps, { table });
    useIsomorphicLayoutEffect(() => {
        const topToolbarHeight = typeof document !== "undefined"
            ? (topToolbarRef.current?.offsetHeight ?? 0)
            : 0;
        const bottomToolbarHeight = typeof document !== "undefined"
            ? (bottomToolbarRef?.current?.offsetHeight ?? 0)
            : 0;
        setTotalToolbarHeight(topToolbarHeight + bottomToolbarHeight);
    });
    const createModalOpen = createDisplayMode === "modal" && creatingRow;
    const editModalOpen = editDisplayMode === "modal" && editingRow;
    return (jsxRuntime.jsxs(core.Box, { ...tableContainerProps, __vars: {
            "--mrt-top-toolbar-height": `${totalToolbarHeight}`,
            ...tableContainerProps?.__vars,
        }, className: clsx("mrt-table-container", classes$1.root, enableStickyHeader && classes$1["root-sticky"], isFullScreen && classes$1["root-fullscreen"], tableContainerProps?.className), ref: (node) => {
            if (node) {
                tableContainerRef.current = node;
                if (tableContainerProps?.ref) {
                    tableContainerProps.ref.current = node;
                }
            }
        }, children: [jsxRuntime.jsx(core.LoadingOverlay, { visible: isLoading || showLoadingOverlay, zIndex: 2, ...loadingOverlayProps }), jsxRuntime.jsx(MRT_Table, { table: table }), (createModalOpen || editModalOpen) && (jsxRuntime.jsx(MRT_EditRowModal, { open: true, table: table }))] }));
};

var classes = {"root":"MRT_TablePaper-module_root__q0v5L"};

const MRT_TablePaper = ({ table, ...rest }) => {
    const { getState, options: { enableBottomToolbar, enableTopToolbar, mantinePaperProps, renderBottomToolbar, renderTopToolbar, }, refs: { tablePaperRef }, } = table;
    const { isFullScreen } = getState();
    const tablePaperProps = {
        ...parseFromValuesOrFunc(mantinePaperProps, { table }),
        ...rest,
    };
    return (jsxRuntime.jsxs(core.Paper, { shadow: "xs", withBorder: true, ...tablePaperProps, className: clsx("mrt-table-paper", classes.root, isFullScreen && "mrt-table-paper-fullscreen", tablePaperProps?.className), ref: (ref) => {
            tablePaperRef.current = ref;
            if (tablePaperProps?.ref) {
                tablePaperProps.ref.current = ref;
            }
        }, 
        // rare case where we should use inline styles to guarantee highest specificity
        style: (theme) => ({
            zIndex: isFullScreen ? 200 : undefined,
            ...parseFromValuesOrFunc(tablePaperProps?.style, theme),
            ...(isFullScreen
                ? {
                    border: 0,
                    borderRadius: 0,
                    bottom: 0,
                    height: "100vh",
                    left: 0,
                    margin: 0,
                    maxHeight: "100vh",
                    maxWidth: "100vw",
                    padding: 0,
                    position: "fixed",
                    right: 0,
                    top: 0,
                    width: "100vw",
                }
                : null),
        }), children: [enableTopToolbar &&
                (parseFromValuesOrFunc(renderTopToolbar, { table }) ?? (jsxRuntime.jsx(MRT_TopToolbar, { table: table }))), jsxRuntime.jsx(MRT_TableContainer, { table: table }), enableBottomToolbar &&
                (parseFromValuesOrFunc(renderBottomToolbar, { table }) ?? (jsxRuntime.jsx(MRT_BottomToolbar, { table: table })))] }));
};

const isTableInstanceProp = (props) => props.table !== undefined;
const MantineReactTable = (props) => {
    let table;
    if (isTableInstanceProp(props)) {
        table = props.table;
    }
    else {
        table = useMantineReactTable(props);
    }
    return jsxRuntime.jsx(MRT_TablePaper, { table: table });
};

exports.MRT_AggregationFns = MRT_AggregationFns;
exports.MRT_BottomToolbar = MRT_BottomToolbar;
exports.MRT_ColumnActionMenu = MRT_ColumnActionMenu;
exports.MRT_ColumnPinningButtons = MRT_ColumnPinningButtons;
exports.MRT_CopyButton = MRT_CopyButton;
exports.MRT_DefaultColumn = MRT_DefaultColumn;
exports.MRT_DefaultDisplayColumn = MRT_DefaultDisplayColumn;
exports.MRT_EditActionButtons = MRT_EditActionButtons;
exports.MRT_EditCellTextInput = MRT_EditCellTextInput;
exports.MRT_EditRowModal = MRT_EditRowModal;
exports.MRT_ExpandAllButton = MRT_ExpandAllButton;
exports.MRT_ExpandButton = MRT_ExpandButton;
exports.MRT_FilterCheckbox = MRT_FilterCheckbox;
exports.MRT_FilterFns = MRT_FilterFns;
exports.MRT_FilterOptionMenu = MRT_FilterOptionMenu;
exports.MRT_FilterRangeFields = MRT_FilterRangeFields;
exports.MRT_FilterRangeSlider = MRT_FilterRangeSlider;
exports.MRT_FilterTextInput = MRT_FilterTextInput;
exports.MRT_GlobalFilterTextInput = MRT_GlobalFilterTextInput;
exports.MRT_GrabHandleButton = MRT_GrabHandleButton;
exports.MRT_ProgressBar = MRT_ProgressBar;
exports.MRT_RowActionMenu = MRT_RowActionMenu;
exports.MRT_RowPinButton = MRT_RowPinButton;
exports.MRT_SelectCheckbox = MRT_SelectCheckbox;
exports.MRT_ShowHideColumnsButton = MRT_ShowHideColumnsButton;
exports.MRT_ShowHideColumnsMenu = MRT_ShowHideColumnsMenu;
exports.MRT_ShowHideColumnsMenuItems = MRT_ShowHideColumnsMenuItems;
exports.MRT_SortingFns = MRT_SortingFns;
exports.MRT_Table = MRT_Table;
exports.MRT_TableBody = MRT_TableBody;
exports.MRT_TableBodyCell = MRT_TableBodyCell;
exports.MRT_TableBodyCellValue = MRT_TableBodyCellValue;
exports.MRT_TableBodyEmptyRow = MRT_TableBodyEmptyRow;
exports.MRT_TableBodyRow = MRT_TableBodyRow;
exports.MRT_TableBodyRowGrabHandle = MRT_TableBodyRowGrabHandle;
exports.MRT_TableBodyRowPinButton = MRT_TableBodyRowPinButton;
exports.MRT_TableContainer = MRT_TableContainer;
exports.MRT_TableDetailPanel = MRT_TableDetailPanel;
exports.MRT_TableFooter = MRT_TableFooter;
exports.MRT_TableFooterCell = MRT_TableFooterCell;
exports.MRT_TableFooterRow = MRT_TableFooterRow;
exports.MRT_TableHead = MRT_TableHead;
exports.MRT_TableHeadCell = MRT_TableHeadCell;
exports.MRT_TableHeadCellFilterContainer = MRT_TableHeadCellFilterContainer;
exports.MRT_TableHeadCellFilterLabel = MRT_TableHeadCellFilterLabel;
exports.MRT_TableHeadCellGrabHandle = MRT_TableHeadCellGrabHandle;
exports.MRT_TableHeadCellResizeHandle = MRT_TableHeadCellResizeHandle;
exports.MRT_TableHeadCellSortLabel = MRT_TableHeadCellSortLabel;
exports.MRT_TableHeadRow = MRT_TableHeadRow;
exports.MRT_TablePagination = MRT_TablePagination;
exports.MRT_TablePaper = MRT_TablePaper;
exports.MRT_ToggleDensePaddingButton = MRT_ToggleDensePaddingButton;
exports.MRT_ToggleFiltersButton = MRT_ToggleFiltersButton;
exports.MRT_ToggleFullScreenButton = MRT_ToggleFullScreenButton;
exports.MRT_ToggleGlobalFilterButton = MRT_ToggleGlobalFilterButton;
exports.MRT_ToggleRowActionMenuButton = MRT_ToggleRowActionMenuButton;
exports.MRT_ToolbarAlertBanner = MRT_ToolbarAlertBanner;
exports.MRT_ToolbarDropZone = MRT_ToolbarDropZone;
exports.MRT_ToolbarInternalButtons = MRT_ToolbarInternalButtons;
exports.MRT_TopToolbar = MRT_TopToolbar;
exports.MantineReactTable = MantineReactTable;
exports.Memo_MRT_TableBody = Memo_MRT_TableBody;
exports.Memo_MRT_TableBodyCell = Memo_MRT_TableBodyCell;
exports.Memo_MRT_TableBodyRow = Memo_MRT_TableBodyRow;
exports.createMRTColumnHelper = createMRTColumnHelper;
exports.createRow = createRow;
exports.dataVariable = dataVariable;
exports.defaultDisplayColumnProps = defaultDisplayColumnProps;
exports.flexRender = flexRender;
exports.getAllLeafColumnDefs = getAllLeafColumnDefs;
exports.getCanRankRows = getCanRankRows;
exports.getColumnId = getColumnId;
exports.getDefaultColumnFilterFn = getDefaultColumnFilterFn;
exports.getDefaultColumnOrderIds = getDefaultColumnOrderIds;
exports.getIsRankingRows = getIsRankingRows;
exports.getIsRowSelected = getIsRowSelected;
exports.getLeadingDisplayColumnIds = getLeadingDisplayColumnIds;
exports.getMRT_RowSelectionHandler = getMRT_RowSelectionHandler;
exports.getMRT_Rows = getMRT_Rows;
exports.getMRT_SelectAllHandler = getMRT_SelectAllHandler;
exports.getPrimaryColor = getPrimaryColor;
exports.getPrimaryShade = getPrimaryShade;
exports.getTrailingDisplayColumnIds = getTrailingDisplayColumnIds;
exports.localizedFilterOption = localizedFilterOption;
exports.mrtFilterOptions = mrtFilterOptions;
exports.parseCSSVarId = parseCSSVarId;
exports.parseFromValuesOrFunc = parseFromValuesOrFunc;
exports.prepareColumns = prepareColumns;
exports.rankGlobalFuzzy = rankGlobalFuzzy;
exports.reorderColumn = reorderColumn;
exports.showRowActionsColumn = showRowActionsColumn;
exports.showRowDragColumn = showRowDragColumn;
exports.showRowExpandColumn = showRowExpandColumn;
exports.showRowNumbersColumn = showRowNumbersColumn;
exports.showRowPinningColumn = showRowPinningColumn;
exports.showRowSelectionColumn = showRowSelectionColumn;
exports.showRowSpacerColumn = showRowSpacerColumn;
exports.useMRT_ColumnVirtualizer = useMRT_ColumnVirtualizer;
exports.useMRT_Effects = useMRT_Effects;
exports.useMRT_RowVirtualizer = useMRT_RowVirtualizer;
exports.useMRT_Rows = useMRT_Rows;
exports.useMRT_TableInstance = useMRT_TableInstance;
exports.useMRT_TableOptions = useMRT_TableOptions;
exports.useMantineReactTable = useMantineReactTable;
//# sourceMappingURL=index.cjs.map
