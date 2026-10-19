import { ColumnFiltersState, createColumnHelper, OnChangeFn } from '@tanstack/react-table'
import { useEffect, useMemo } from 'react'

import type { PLCGlobalVariable } from '../../../../middleware/shared/ports/types'
import { HMI_PUBLISH_DEFAULT_GROUP } from '../../../../middleware/shared/utils/hmi-publish'
import { usePouSnapshot } from '../../../hooks/use-pou-snapshot'
import { useOpenPLCStore } from '../../../store'
import { GenericTable } from '../../_atoms/generic-table'
import { LiveValueCell } from '../../_features/[workspace]/forcing/live-value-cell'
import {
  EditableDocumentationCell,
  EditableGroupCell,
  EditableInitialValueCell,
  EditableLocationCell,
  EditableNameCell,
} from './editable-cell'
import { SelectablePublishCell, SelectableRetainCell, SelectableTypeCell } from './selectable-cell'

const columnHelper = createColumnHelper<PLCGlobalVariable>()

/** Effective GVL group of a row — empty label collapses to the default. */
export const groupOfVariable = (variable: Pick<PLCGlobalVariable, 'group'>): string =>
  (variable.group ?? '').trim() || HMI_PUBLISH_DEFAULT_GROUP

const columns = [
  columnHelper.display({
    id: 'rowNumber',
    header: '#',
    size: 64,
    minSize: 32,
    maxSize: 64,
    enableResizing: true,
    cell: (props) => props.row.index,
  }),
  columnHelper.accessor('name', {
    header: 'Name',
    enableResizing: true,
    size: 300,
    minSize: 150,
    maxSize: 300,
    cell: EditableNameCell,
  }),
  columnHelper.accessor('class', {
    header: 'Class',
    enableResizing: true,
    cell: 'Global',
  }),
  columnHelper.accessor('group', {
    header: 'Group',
    enableResizing: true,
    size: 160,
    minSize: 96,
    maxSize: 240,
    cell: EditableGroupCell,
    // Group filters: the editor passes the ACTIVE group names as the filter value; with
    // none active every row is shown, otherwise only the rows of an active group.
    filterFn: (row, _columnId, activeGroups: string[]) =>
      activeGroups.length === 0 || activeGroups.includes(groupOfVariable(row.original)),
  }),
  columnHelper.accessor('type', {
    header: 'Type',
    enableResizing: true,
    size: 300,
    minSize: 80,
    maxSize: 300,
    cell: SelectableTypeCell,
  }),
  columnHelper.accessor('location', {
    header: 'Location',
    enableResizing: true,
    cell: EditableLocationCell,
  }),
  columnHelper.accessor('initialValue', {
    header: 'Initial Value',
    enableResizing: true,
    cell: EditableInitialValueCell,
  }),
  columnHelper.accessor('documentation', {
    header: 'Documentation',
    enableResizing: true,
    size: 468,
    minSize: 198,
    maxSize: 468,
    cell: EditableDocumentationCell,
  }),
  columnHelper.accessor('publish', {
    header: 'Publish',
    size: 64,
    minSize: 64,
    maxSize: 64,
    cell: SelectablePublishCell,
  }),
  columnHelper.accessor('retain', {
    header: 'Retain',
    size: 64,
    minSize: 64,
    maxSize: 64,
    cell: SelectableRetainCell,
  }),
]

/** While logged in: the live value; a click prepares it (F7 forces, Ctrl+F7 writes). A global's
 *  debug-map path is its name in upper case. */
const liveColumn = columnHelper.display({
  id: 'liveValue',
  header: 'Value',
  size: 180,
  minSize: 96,
  maxSize: 300,
  enableResizing: true,
  cell: (props) => <LiveValueCell variableKey={props.row.original.name.toUpperCase()} />,
})

type PLCVariablesTableProps = {
  tableData: PLCGlobalVariable[]
  selectedRow: number
  handleRowClick: (row: HTMLTableRowElement) => void
  columnFilters?: ColumnFiltersState
  setColumnFilters?: OnChangeFn<ColumnFiltersState>
}

const GlobalVariablesTable = ({
  tableData,
  selectedRow,
  handleRowClick,
  columnFilters,
  setColumnFilters,
}: PLCVariablesTableProps) => {
  const {
    editor: {
      meta: { name },
    },
    projectActions: { updateVariable },
    sharedWorkspaceActions: { handleFileAndWorkspaceSavedState },
  } = useOpenPLCStore()

  const { captureAndPush } = usePouSnapshot()
  const isDebuggerVisible = useOpenPLCStore((s) => s.workspace.isDebuggerVisible)
  const setExtraKeys = useOpenPLCStore((s) => s.workspaceActions.setDebugExtraKeys)
  const shownColumns = useMemo(
    () => (isDebuggerVisible ? [...columns.slice(0, 2), liveColumn, ...columns.slice(2)] : columns),
    [isDebuggerVisible],
  )
  // The globals shown here are polled while the resource is open and logged in.
  useEffect(() => {
    setExtraKeys('resource-globals', isDebuggerVisible ? tableData.map((v) => v.name.toUpperCase()) : [])
    return () => setExtraKeys('resource-globals', [])
  }, [isDebuggerVisible, tableData, setExtraKeys])

  return (
    <GenericTable<PLCGlobalVariable>
      columns={shownColumns}
      tableData={tableData}
      selectedRow={selectedRow}
      handleRowClick={handleRowClick}
      columnFilters={columnFilters}
      setColumnFilters={setColumnFilters}
      updateData={(rowIndex, columnId, value) => {
        captureAndPush(name)
        const result = updateVariable({ scope: 'global', rowId: rowIndex, data: { [columnId]: value } })
        if (result.ok) {
          handleFileAndWorkspaceSavedState('Resource')
        }
        return result
      }}
      tableContext='Variables'
    />
  )
}

export { GlobalVariablesTable }
