import {
  ColumnDef,
  ColumnFiltersState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  OnChangeFn,
  SortingState,
  useReactTable,
} from '@tanstack/react-table'
import { useEffect, useRef } from 'react'

import type { ProjectResponse } from '../../../store/slices/project'
import { cn } from '../../../utils/cn'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../table'

type GenericTableProps<T> = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  columns: ColumnDef<T, any>[]
  tableData: T[]
  selectedRow: number
  handleRowClick: (row: HTMLTableRowElement) => void
  updateData: (rowIndex: number, columnId: string, value: unknown) => ProjectResponse
  tableContext: string
  filterValue?: string
  columnFilters?: ColumnFiltersState
  setColumnFilters?: OnChangeFn<ColumnFiltersState> | undefined
  /** A table whose VIEW sorts by a header click (A-Z, Z-A, off). Rows keep their ids, so the
   *  selection and the edits still name the stored row. Absent: no sorting, as before. */
  sorting?: SortingState
  setSorting?: OnChangeFn<SortingState>
}

function GenericTable<T>({
  columns,
  tableData,
  selectedRow,
  handleRowClick,
  updateData,
  tableContext,
  filterValue,
  columnFilters,
  setColumnFilters,
  sorting,
  setSorting,
}: GenericTableProps<T>) {
  const sortable = sorting !== undefined && setSorting !== undefined
  const tableHeaderRef = useRef<HTMLTableSectionElement>(null)
  const tableBodyRef = useRef<HTMLTableSectionElement>(null)
  const tableBodyRowRef = useRef<HTMLTableRowElement>(null)

  const resetBorders = () => {
    const parent = tableBodyRef.current
    const header = tableHeaderRef.current
    if (!parent?.children || !header?.children) return

    const rows = Array.from(parent.children)
    const headers = Array.from(header.children)
    rows.forEach((row) => {
      row.className = cn(
        row.className,
        '[&:last-child>td]:border-b-neutral-500 [&>td:first-child]:border-l-neutral-500 [&>td:last-child]:border-r-neutral-500 [&>td]:border-b-neutral-300',
        'dark:[&>td:first-child]:border-l-neutral-500 dark:[&>td:last-child]:border-r-neutral-500 dark:[&>td]:border-b-neutral-800',
        'shadow-none dark:shadow-none',
      )
    })
    headers.forEach((header) => {
      header.className = cn(header.className, '[&>th]:border-neutral-300 dark:[&>th]:border-neutral-800')
    })
  }

  const setBorders = () => {
    const row = tableBodyRowRef.current
    const parent = tableBodyRef.current
    const header = tableHeaderRef.current
    if (!row || !parent || !header) return

    const headerRow = row === parent?.firstChild ? header?.lastElementChild : null
    const element = headerRow ?? row?.previousElementSibling

    if (element) {
      element.className = cn(
        element.className,
        '[&>td]:border-b-brand dark:[&>td]:border-b-brand',
        '[&>th]:border-b-brand dark:[&>th]:border-b-brand',
      )
    }
    row.className = cn(
      row.className,
      '[&:last-child>td]:border-b-brand [&>td:first-child]:border-l-brand [&>td:last-child]:border-r-brand [&>td]:border-b-brand',
      'dark:[&>td:first-child]:border-l-brand dark:[&>td:last-child]:border-r-brand dark:[&>td]:border-b-brand',
    )
  }

  useEffect(() => {
    resetBorders()
    setBorders()
  }, [selectedRow])

  useEffect(() => {
    resetBorders()
    if (tableBodyRowRef.current) {
      setBorders()
    }
  }, [filterValue])

  const table = useReactTable<T>({
    columns,
    data: tableData,
    columnResizeMode: 'onChange',
    defaultColumn: {
      size: 128,
      minSize: 80,
      maxSize: 128,
    },
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    ...(sortable ? { getSortedRowModel: getSortedRowModel(), onSortingChange: setSorting } : {}),
    enableSorting: sortable,
    state: sortable ? { columnFilters, sorting } : { columnFilters },
    onColumnFiltersChange: setColumnFilters,
    meta: {
      updateData: (rowIndex, columnId, value) => {
        return updateData(rowIndex, columnId, value)
      },
    },
    debugTable: true,
  })

  return (
    <Table context={tableContext} className='mr-1 w-full'>
      <TableHeader ref={tableHeaderRef}>
        {table.getHeaderGroups().map((headerGroup) => (
          <TableRow className='select-none' key={headerGroup.id}>
            {headerGroup.headers.map((header) => (
              <TableHead
                resizable={header.column.columnDef.enableResizing}
                isResizing={header.column.getIsResizing()}
                resizeHandler={header.getResizeHandler()}
                style={{
                  width: header.getSize(),
                  maxWidth: header.column.columnDef.maxSize,
                  minWidth: header.column.columnDef.minSize,
                }}
                key={header.id}
                className={cn(sortable && header.column.getCanSort() && 'cursor-pointer hover:text-brand')}
                onClick={sortable && header.column.getCanSort() ? header.column.getToggleSortingHandler() : undefined}
                title={sortable && header.column.getCanSort() ? 'Sort by this column (again: the other way, then off)' : undefined}
              >
                {flexRender(header.column.columnDef.header, header.getContext())}
                {sortable && header.column.getIsSorted() && (
                  <span className='ml-1 text-brand'>{header.column.getIsSorted() === 'asc' ? '▲' : '▼'}</span>
                )}
              </TableHead>
            ))}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody ref={tableBodyRef}>
        {table.getRowModel().rows.map((row) => (
          <TableRow
            id={row.id}
            key={row.id}
            className='h-8 cursor-pointer'
            onClick={(e) => handleRowClick(e.currentTarget)}
            selected={selectedRow === parseInt(row.id)}
            ref={selectedRow === parseInt(row.id) ? tableBodyRowRef : null}
          >
            {row.getVisibleCells().map((cell) => (
              <TableCell
                style={{
                  width: cell.column.getSize(),
                  maxWidth: cell.column.columnDef.maxSize,
                  minWidth: cell.column.columnDef.minSize,
                }}
                key={cell.id}
              >
                {flexRender(cell.column.columnDef.cell, {
                  ...cell.getContext(),
                  editable: selectedRow === parseInt(row.id),
                  selected: selectedRow === parseInt(row.id),
                  scope: 'local',
                })}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

export { GenericTable }
