import { ColumnFiltersState, createColumnHelper, OnChangeFn } from '@tanstack/react-table'

import type { PLCGlobalVariable } from '../../../../middleware/shared/ports/types'
import { HMI_PUBLISH_DEFAULT_GROUP } from '../../../../middleware/shared/utils/hmi-publish'
import { usePouSnapshot } from '../../../hooks/use-pou-snapshot'
import { useOpenPLCStore } from '../../../store'
import { GenericTable } from '../../_atoms/generic-table'
import {
  EditableDocumentationCell,
  EditableGroupCell,
  EditableInitialValueCell,
  EditableLocationCell,
  EditableNameCell,
} from './editable-cell'
import { SelectableDebugCell, SelectablePublishCell, SelectableTypeCell } from './selectable-cell'

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
    // Collapsible-group support: the editor passes the COLLAPSED group
    // names as the filter value; a row stays visible while its group is
    // not collapsed. Row ids stay index-based on the unfiltered data,
    // so selection / add / remove semantics are untouched.
    filterFn: (row, _columnId, collapsedGroups: string[]) => !collapsedGroups.includes(groupOfVariable(row.original)),
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
  columnHelper.accessor('debug', { header: 'Debug', size: 64, minSize: 64, maxSize: 64, cell: SelectableDebugCell }),
  columnHelper.accessor('publish', {
    header: 'Publish',
    size: 64,
    minSize: 64,
    maxSize: 64,
    cell: SelectablePublishCell,
  }),
]

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

  return (
    <GenericTable<PLCGlobalVariable>
      columns={columns}
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
