import { useFieldArray, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import type { z } from 'zod'
import { PlusIcon, TrashIcon } from '@phosphor-icons/react'
import {
  FORMATS,
  FORMAT_LABELS,
  READING_LABELS,
  READING_STATUSES,
  ROLES,
  ROLE_LABELS
} from '../../../../shared/books'
import { BookInputSchema } from '../../../../shared/schemas'
import { Button } from '../PageHeader'
import { Field, fieldClass } from '../ui'

type FormIn = z.input<typeof BookInputSchema>
export type BookFormValues = z.output<typeof BookInputSchema>

const emptyNumber = (v: unknown): number | undefined => (v === '' || v === null || Number.isNaN(Number(v)) ? undefined : Number(v))

interface BookFormProps {
  mode: 'add' | 'edit'
  defaultValues: Partial<FormIn>
  busy: boolean
  onSubmit: (values: BookFormValues) => void
  onCancel: () => void
}

/** Add or edit a book by hand. Only the title is required. */
export function BookForm({ mode, defaultValues, busy, onSubmit, onCancel }: BookFormProps) {
  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors }
  } = useForm<FormIn, unknown, BookFormValues>({
    resolver: zodResolver(BookInputSchema),
    mode: 'onTouched',
    defaultValues: {
      contributors: [{ name: '', role: 'author' }],
      ownership: 'owned',
      readingStatus: null,
      ...defaultValues
    }
  })
  const people = useFieldArray({ control, name: 'contributors' })

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="grid gap-8" noValidate aria-label={mode === 'add' ? 'Add book' : 'Edit book'}>
      <section className="grid gap-4 rounded-xl border border-border bg-surface p-6">
        <h2 className="m-0 text-[13px] font-semibold uppercase tracking-[0.08em] text-muted">The book</h2>
        <Field label="Title *" error={errors.title?.message}>
          <input className={fieldClass} autoFocus aria-invalid={!!errors.title} {...register('title')} />
        </Field>
        <Field label="Subtitle">
          <input className={fieldClass} {...register('subtitle')} />
        </Field>

        <div>
          <span className="mb-1 block text-[13px] font-medium">Authors and other people</span>
          <div className="grid gap-2">
            {people.fields.map((f, i) => (
              <div key={f.id} className="flex gap-2">
                <input
                  className={fieldClass}
                  placeholder="Name, e.g. Susanna Clarke"
                  aria-label={`Person ${i + 1} name`}
                  {...register(`contributors.${i}.name`)}
                />
                <select className={`${fieldClass} w-40`} aria-label={`Person ${i + 1} role`} {...register(`contributors.${i}.role`)}>
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => people.remove(i)}
                  className="grid size-10 shrink-0 place-items-center rounded-lg text-muted hover:bg-bg hover:text-danger"
                  aria-label={`Remove person ${i + 1}`}
                  disabled={people.fields.length === 1}
                >
                  <TrashIcon size={16} />
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => people.append({ name: '', role: 'author' })}
            className="mt-2 flex items-center gap-1 text-[13px] font-medium text-accent hover:underline"
          >
            <PlusIcon size={14} weight="bold" /> Add another person
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Series">
            <input className={fieldClass} placeholder="e.g. Discworld" {...register('seriesName')} />
          </Field>
          <Field label="Number in series" error={errors.seriesNumber?.message}>
            <input className={fieldClass} type="number" step="0.5" min="0" {...register('seriesNumber', { setValueAs: emptyNumber })} />
          </Field>
        </div>

        <Field label="Description">
          <textarea className={`${fieldClass} h-32 py-2`} {...register('description')} />
        </Field>
      </section>

      <section className="grid gap-4 rounded-xl border border-border bg-surface p-6">
        <h2 className="m-0 text-[13px] font-semibold uppercase tracking-[0.08em] text-muted">Edition</h2>
        <div className="grid grid-cols-2 gap-4">
          <Field label="ISBN" error={errors.isbn?.message} hint="10 or 13 digits; hyphens are fine">
            <input className={fieldClass} inputMode="numeric" aria-invalid={!!errors.isbn} {...register('isbn')} />
          </Field>
          <Field label="Publisher">
            <input className={fieldClass} {...register('publisher')} />
          </Field>
          <Field label="Published" error={errors.pubDate?.message} hint="A year (2020) or a date (2020-09-15)">
            <input className={fieldClass} placeholder="2020" aria-invalid={!!errors.pubDate} {...register('pubDate')} />
          </Field>
          <Field label="Pages" error={errors.pages?.message}>
            <input className={fieldClass} type="number" min="1" {...register('pages', { setValueAs: emptyNumber })} />
          </Field>
          <Field label="Format">
            <select className={fieldClass} {...register('format', { setValueAs: (v) => v || undefined })}>
              <option value="">&mdash;</option>
              {FORMATS.map((f) => (
                <option key={f} value={f}>
                  {FORMAT_LABELS[f]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Language">
            <input className={fieldClass} placeholder="English" {...register('language')} />
          </Field>
        </div>
      </section>

      {mode === 'add' && (
        <section className="grid gap-4 rounded-xl border border-border bg-surface p-6">
          <h2 className="m-0 text-[13px] font-semibold uppercase tracking-[0.08em] text-muted">Your shelves</h2>
          <label className="flex items-center gap-2 text-[14px]">
            <input
              type="checkbox"
              className="size-4 accent-[var(--accent)]"
              checked={watch('ownership') === 'wishlist'}
              onChange={(e) => setValue('ownership', e.target.checked ? 'wishlist' : 'owned')}
            />
            I don&rsquo;t own it yet &mdash; put it on <strong>Want to buy</strong>
          </label>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Reading">
              <select className={fieldClass} {...register('readingStatus', { setValueAs: (v) => v || null })}>
                <option value="">Not started</option>
                {READING_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {READING_LABELS[s]}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </section>
      )}

      <div className="flex justify-end gap-3">
        <Button variant="secondary" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy}>
          {busy ? 'Saving…' : mode === 'add' ? 'Add to library' : 'Save changes'}
        </Button>
      </div>
    </form>
  )
}
