import { ColumnFiltersState, createColumnHelper } from '@tanstack/react-table'
import { useEffect, useMemo } from 'react'

import type { PLCGlobalVariable } from '../../../../middleware/shared/ports/types'
import { usePouSnapshot } from '../../../hooks/use-pou-snapshot'
import { useOpenPLCStore } from '../../../store'
import { gvlOf } from '../../../utils/global-variable-lists'
import { GenericTable } from '../../_atoms/generic-table'
import { LiveTreeCell } from '../../_features/[workspace]/forcing/live-tree-cell'
import {
  EditableDocumentationCell,
  EditableGroupCell,
  EditableInitialValueCell,
  EditableLocationCell,
  EditableNameCell,
} from './editable-cell'
import {
  SelectablePersistentCell,
  SelectablePublishCell,
  SelectableRetainCell,
  SelectableTypeCell,
} from './selectable-cell'

const columnHelper = createColumnHelper<PLCGlobalVariable>()

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
  // The row's GVL: another name moves it to that GVL (a new name makes a new GVL).
  columnHelper.accessor('group', {
    header: 'GVL',
    enableResizing: true,
    size: 160,
    minSize: 96,
    maxSize: 240,
    cell: EditableGroupCell,
    // The GVL tab shows its own rows only (the filter value: [the GVL]).
    filterFn: (row, _columnId, gvls: string[]) => gvls.length === 0 || gvls.includes(gvlOf(row.original)),
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
  columnHelper.accessor('persistent', {
    header: 'Persistent',
    size: 72,
    minSize: 72,
    maxSize: 72,
    cell: SelectablePersistentCell,
  }),
]

/** While logged in: the live value; a click prepares it (F7 forces, Ctrl+F7 writes). A global's
 *  debug-map path is its name in upper case. An array or FB instance opens as a tree. */
const liveColumn = columnHelper.display({
  id: 'liveValue',
  header: 'Value',
  size: 180,
  minSize: 96,
  maxSize: 300,
  enableResizing: true,
  cell: (props) => <LiveTreeCell variableKey={props.row.original.name.toUpperCase()} />,
})

type PLCVariablesTableProps = {
  tableData: PLCGlobalVariable[]
  selectedRow: number
  handleRowClick: (row: HTMLTableRowElement) => void
  /** The GVL shown; every row when absent. */
  gvl?: string
}

const GlobalVariablesTable = ({
  tableData,
  selectedRow,
  handleRowClick,
  gvl,
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
  const columnFilters = useMemo<ColumnFiltersState>(() => (gvl ? [{ id: 'group', value: [gvl] }] : []), [gvl])
  // The globals shown here are polled while the GVL is open and logged in.
  useEffect(() => {
    const shown = gvl ? tableData.filter((v) => gvlOf(v) === gvl) : tableData
    setExtraKeys('resource-globals', isDebuggerVisible ? shown.map((v) => v.name.toUpperCase()) : [])
    return () => setExtraKeys('resource-globals', [])
  }, [isDebuggerVisible, tableData, gvl, setExtraKeys])

  return (
    <GenericTable<PLCGlobalVariable>
      columns={shownColumns}
      tableData={tableData}
      selectedRow={selectedRow}
      handleRowClick={handleRowClick}
      columnFilters={columnFilters}
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
