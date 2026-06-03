import { TableTfoot, type TableTfootProps } from "@mantine/core";
import clsx from "clsx";
import type {
	MRT_ColumnVirtualizer,
	MRT_RowData,
	MRT_TableInstance,
} from "../../types";
import { parseFromValuesOrFunc } from "../../utils/utils";
import classes from "./MRT_TableFooter.module.css";
import { MRT_TableFooterRow } from "./MRT_TableFooterRow";

interface Props<TData extends MRT_RowData> extends TableTfootProps {
	columnVirtualizer?: MRT_ColumnVirtualizer;
	table: MRT_TableInstance<TData>;
}

export const MRT_TableFooter = <TData extends MRT_RowData>({
	columnVirtualizer,
	table,
	...rest
}: Props<TData>) => {
	const {
		getFooterGroups,
		getState,
		options: { enableStickyFooter, layoutMode, mantineTableFooterProps },
		refs: { tableFooterRef },
	} = table;
	const { isFullScreen } = getState();

	const tableFooterProps = {
		...parseFromValuesOrFunc(mantineTableFooterProps, {
			table,
		}),
		...rest,
	};

	const stickFooter =
		(isFullScreen || enableStickyFooter) && enableStickyFooter !== false;

	return (
		<TableTfoot
			{...tableFooterProps}
			className={clsx(
				classes.root,
				tableFooterProps?.className,
				stickFooter && classes.sticky,
				layoutMode?.startsWith("grid") && classes.grid,
			)}
			ref={(ref: HTMLTableSectionElement) => {
				tableFooterRef.current = ref;
				if (tableFooterProps?.ref) {
					tableFooterProps.ref.current = ref;
				}
			}}
		>
			{getFooterGroups().map((footerGroup) => (
				<MRT_TableFooterRow
					columnVirtualizer={columnVirtualizer}
					footerGroup={footerGroup as any}
					key={footerGroup.id}
					table={table}
				/>
			))}
		</TableTfoot>
	);
};
