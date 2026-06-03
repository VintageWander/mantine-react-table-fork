import { Flex, type FlexProps, Text, Transition } from "@mantine/core";
import clsx from "clsx";

import { type DragEvent, useEffect } from "react";
import type { MRT_RowData, MRT_TableInstance } from "../../types";
import classes from "./MRT_ToolbarDropZone.module.css";

interface Props<TData extends MRT_RowData> extends FlexProps {
	table: MRT_TableInstance<TData>;
}

export const MRT_ToolbarDropZone = <TData extends MRT_RowData>({
	table,
	...rest
}: Props<TData>) => {
	const {
		getState,
		options: { enableGrouping, localization },
		setHoveredColumn,
		setShowToolbarDropZone,
	} = table;

	const { draggingColumn, grouping, hoveredColumn, showToolbarDropZone } =
		getState();

	const handleDragEnter = (_event: DragEvent<HTMLDivElement>) => {
		setHoveredColumn({ id: "drop-zone" });
	};

	useEffect(() => {
		if (table.options.state?.showToolbarDropZone !== undefined) {
			setShowToolbarDropZone(
				!!enableGrouping &&
					!!draggingColumn &&
					draggingColumn.columnDef.enableGrouping !== false &&
					!grouping.includes(draggingColumn.id),
			);
		}
	}, [enableGrouping, draggingColumn, grouping]);

	return (
		<Transition mounted={showToolbarDropZone} transition="fade">
			{() => (
				<Flex
					className={clsx(
						"mrt-toolbar-dropzone",
						classes.root,
						hoveredColumn?.id === "drop-zone" && classes.hovered,
					)}
					onDragEnter={handleDragEnter}
					{...rest}
				>
					<Text>
						{localization.dropToGroupBy.replace(
							"{column}",
							draggingColumn?.columnDef?.header ?? "",
						)}
					</Text>
				</Flex>
			)}
		</Transition>
	);
};
