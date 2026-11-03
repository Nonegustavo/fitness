import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type Announcements,
  type UniqueIdentifier,
} from '@dnd-kit/core'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { cx } from './ui'

const INSTRUCTIONS = {
  draggable: 'Para mudar a ordem, aperte espaço, mova com as setas e aperte espaço de novo para soltar. Esc cancela.',
}

/**
 * A vertical list reordered by dragging each item's handle: with the mouse, a finger, or the keyboard
 * (space to pick up, arrows to move, space to drop).
 */
export function SortableList<T>({
  items,
  getId,
  onReorder,
  children,
  as = 'ul',
  className,
  itemClassName,
}: {
  items: T[]
  getId: (item: T) => string
  onReorder: (items: T[]) => void
  /** Renders one item; put `handle` where the grip goes. */
  children: (item: T, handle: ReactNode) => ReactNode
  as?: 'ul' | 'div'
  className?: string
  itemClassName?: string
}) {
  const sensors = useSensors(
    // A few pixels of travel first, so a plain click on the handle doesn't start a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const ids = items.map(getId)
  const key = ids.join('\n')
  // The dropped order shows at once, until the list comes back from the database in it (or changes otherwise).
  const [pending, setPending] = useState<{ basis: string; order: string[] }>()
  const order = pending?.basis === key ? pending.order : ids
  const position = (id: UniqueIdentifier) => order.indexOf(String(id)) + 1
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Pegou o item ${position(active.id)} de ${order.length}.`,
    onDragOver: ({ over }) => (over ? `Na posição ${position(over.id)}.` : 'Fora da lista.'),
    onDragEnd: ({ over }) => (over ? `Solto na posição ${position(over.id)}.` : 'Solto fora da lista; nada mudou.'),
    onDragCancel: () => 'Movimento cancelado; nada mudou.',
  }
  const List = as
  const Item = as === 'ul' ? 'li' : 'div'

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis]}
      accessibility={{ announcements, screenReaderInstructions: INSTRUCTIONS }}
      onDragEnd={({ active, over }) => {
        if (!over || active.id === over.id) return
        const next = arrayMove(order, order.indexOf(String(active.id)), order.indexOf(String(over.id)))
        setPending({ basis: key, order: next })
        onReorder(next.map((id) => items[ids.indexOf(id)]))
      }}
    >
      <SortableContext items={order} strategy={verticalListSortingStrategy}>
        <List className={className}>
          {order.map((id) => (
            <SortableItem key={id} id={id} as={Item} className={itemClassName}>
              {(handle) => children(items[ids.indexOf(id)], handle)}
            </SortableItem>
          ))}
        </List>
      </SortableContext>
    </DndContext>
  )
}

function SortableItem({
  id,
  as: Item,
  className,
  children,
}: {
  id: string
  as: 'li' | 'div'
  className?: string
  children: (handle: ReactNode) => ReactNode
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id })
  return (
    <Item
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cx(className, isDragging && 'relative z-20 scale-[1.02] shadow-lg')}
    >
      {children(
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label="Arrastar para mudar a ordem"
          className="flex size-9 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg text-muted transition hover:bg-surface-2 hover:text-ink active:cursor-grabbing"
        >
          <GripVertical size={18} />
        </button>,
      )}
    </Item>
  )
}
