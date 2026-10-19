import { ColumnFiltersState, createColumnHelper, OnChangeFn } from '@tanstack/react-table'
import { useEffect, useMemo } from 'react'

import type { PLCVariable } from '../../../../middleware/shared/ports/types'
import { usePouSnapshot } from '../../../hooks/use-pou-snapshot'
import { useOpenPLCStore } from '../../../store'
import { GenericTable } from '../../_atoms/generic-table'
import { LiveValueCell } from '../../_features/[workspace]/forcing/live-value-cell'
import {
  EditableDocumentationCell,
  EditableInitialValueCell,
  EditableLocationCell,
  EditableNameCell,
} from './editable-cell'
import { SelectableClassCell, SelectableTypeCell } from './selectable-cell'

const columnHelper = createColumnHelper<PLCVariable>()

const columnsPrograms = [
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
    cell: SelectableClassCell,
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
]

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
    cell: SelectableClassCell,
  }),
  columnHelper.accessor('type', {
    header: 'Type',
    enableResizing: true,
    size: 300,
    minSize: 80,
    maxSize: 300,
    cell: SelectableTypeCell,
  }),
  columnHelper.accessor('initialValue', {
    header: 'Initial Value',
    enableResizing: true,
    cell: EditableInitialValueCell,
  }),
  columnHelper.accessor('documentation', {
    header: 'Documentation',
    enableResizing: true,
    size: 568,
    minSize: 198,
    maxSize: 568,
    cell: EditableDocumentationCell,
  }),
]

/** While logged in (a PROGRAM's table): the live value; a click prepares it. */
const liveColumnFor = (pouName: string) =>
  columnHelper.display({
    id: 'liveValue',
    header: 'Value',
    size: 180,
    minSize: 96,
    maxSize: 300,
    enableResizing: true,
    cell: (props) => <LiveValueCell variableKey={`${pouName}:${props.row.original.name}`} />,
  })

type PLCVariablesTableProps = {
  tableData: PLCVariable[]
  filterValue?: string
  columnFilters?: ColumnFiltersState
  setColumnFilters?: OnChangeFn<ColumnFiltersState> | undefined
  selectedRow: number
  handleRowClick: (row: HTMLTableRowElement) => void
}

const VariablesTable = ({
  tableData,
  filterValue,
  columnFilters,
  setColumnFilters,
  selectedRow,
  handleRowClick,
}: PLCVariablesTableProps) => {
  const {
    editor: {
      meta: { name },
    },
    project: {
      data: { pous },
    },
    projectActions: { updateVariable },
    sharedWorkspaceActions: { handleFileAndWorkspaceSavedState },
  } = useOpenPLCStore()
  const { captureAndPush } = usePouSnapshot()

  const pou = pous.find((p) => p.name === name)
  const isDebuggerVisible = useOpenPLCStore((s) => s.workspace.isDebuggerVisible)
  const setExtraKeys = useOpenPLCStore((s) => s.workspaceActions.setDebugExtraKeys)
  const isProgram = pou?.pouType === 'program'
  const shownColumns = useMemo(() => {
    if (!isProgram) return columns
    if (!isDebuggerVisible) return columnsPrograms
    return [...columnsPrograms.slice(0, 2), liveColumnFor(name), ...columnsPrograms.slice(2)]
  }, [isProgram, isDebuggerVisible, name])
  useEffect(() => {
    setExtraKeys('pou-table', isProgram && isDebuggerVisible ? tableData.map((v) => `${name}:${v.name}`) : [])
    return () => setExtraKeys('pou-table', [])
  }, [isProgram, isDebuggerVisible, tableData, name, setExtraKeys])

  return (
    <GenericTable<PLCVariable>
      columns={shownColumns}
      tableData={tableData}
      selectedRow={selectedRow}
      handleRowClick={handleRowClick}
      updateData={(rowIndex, columnId, value) => {
        captureAndPush(name)

        if (columnId === 'class' && filterValue !== undefined && filterValue !== 'all' && filterValue !== value) {
          return {
            ok: false,
            message: '',
          }
        }

        const result = updateVariable({
          scope: 'local',
          associatedPou: name,
          rowId: rowIndex,
          data: {
            [columnId]: value,
          },
        })
        if (result.ok) {
          handleFileAndWorkspaceSavedState(name)
        }
        return result
      }}
      tableContext='Variables'
      columnFilters={columnFilters}
      setColumnFilters={setColumnFilters}
      filterValue={filterValue}
    />
  )
}

export { VariablesTable }
