import { useMemo, useState } from 'react'
import { UNITS, type Chef, type Recipe, type RecipeIngredient } from '../types'
import { categoryOptions } from '../lib/categories'
import { safeUrl } from '../lib/util'
import { ingredientsToText, parseIngredientList } from '../lib/ingredientText'
import { useStore } from '../lib/store'
import { Field, Sheet, UserPicker, toast } from './ui'
import { IconPhoto, IconPlus, IconTrash } from './Icons'
import { discardPhoto, isPendingPhoto, uploadRecipePhoto } from '../lib/photos'
import { Thumb } from './RecipeRow'

// Единица пустая по умолчанию: «столько грамм на столько порций» — необязательная точность.
const EMPTY_INGREDIENT: RecipeIngredient = { name: '', qty: null, unit: '' }

export function RecipeEditor({
  recipe,
  onClose,
  onSaved,
}: {
  recipe?: Recipe
  onClose: () => void
  onSaved?: (recipe: Recipe) => void
}) {
  const { db, saveRecipe } = useStore()
  const categories = categoryOptions(db, recipe?.category)
  const [name, setName] = useState(recipe?.name ?? '')
  const [category, setCategory] = useState<string>(recipe?.category ?? categories[0] ?? 'Основное')
  const [regular, setRegular] = useState(Boolean(recipe?.regular))
  const [regularEveryDays, setRegularEveryDays] = useState(
    recipe?.regularEveryDays != null ? String(recipe.regularEveryDays) : '7',
  )
  const [tags, setTags] = useState((recipe?.tags ?? []).join(', '))
  const [timeMin, setTimeMin] = useState(recipe?.timeMin?.toString() ?? '')
  const [servings, setServings] = useState(recipe?.servings?.toString() ?? '')
  const [difficulty, setDifficulty] = useState<1 | 2 | 3>(recipe?.difficulty ?? 1)
  const [chef, setChef] = useState<Chef>(recipe?.chef ?? 'any')
  const [steps, setSteps] = useState(recipe?.steps ?? '')
  const [sourceUrl, setSourceUrl] = useState(recipe?.sourceUrl ?? '')
  const [photoId, setPhotoId] = useState(recipe?.photoId)
  const [uploading, setUploading] = useState(false)
  const [ingredients, setIngredients] = useState<RecipeIngredient[]>(
    recipe?.ingredients?.length ? recipe.ingredients : [{ ...EMPTY_INGREDIENT }],
  )
  const [mode, setMode] = useState<'rows' | 'text'>('rows')
  const [draftText, setDraftText] = useState('')

  /** Подсказки названий продуктов из каталога и других рецептов. */
  const suggestions = useMemo(() => {
    const names = new Set<string>()
    for (const product of Object.values(db.products)) if (!product.deletedAt) names.add(product.name)
    for (const item of Object.values(db.recipes)) {
      if (item.deletedAt) continue
      for (const ingredient of item.ingredients) if (ingredient.name) names.add(ingredient.name)
    }
    return [...names].sort((a, b) => a.localeCompare(b, 'ru'))
  }, [db.products, db.recipes])

  const setIngredient = (index: number, patch: Partial<RecipeIngredient>) => {
    setIngredients((list) => list.map((item, i) => (i === index ? { ...item, ...patch } : item)))
  }

  const onPickPhoto = async (file: File | undefined) => {
    if (!file) return
    setUploading(true)
    try {
      // Старый файл не трогаем: правку ещё могут отменить, и фото исчезло бы зря.
      const uploaded = await uploadRecipePhoto(file)
      setPhotoId(uploaded)
      if (isPendingPhoto(uploaded)) toast('Фото сохранится на Диск, когда появится сеть')
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Не удалось загрузить фото')
    } finally {
      setUploading(false)
    }
  }

  /*
   * Фотографии на Диске живут отдельно от базы, поэтому лишние надо убирать руками:
   * при сохранении — заменённую старую, при отмене — только что загруженную,
   * на которую уже никто не ссылается.
   */
  const initialPhotoId = recipe?.photoId

  const cancel = () => {
    if (photoId && photoId !== initialPhotoId) void discardPhoto(photoId)
    onClose()
  }

  const submit = () => {
    if (!name.trim()) {
      toast('Впишите название блюда')
      return
    }
    if (initialPhotoId && initialPhotoId !== photoId) void discardPhoto(initialPhotoId)
    const saved = saveRecipe({
      id: recipe?.id,
      name: name.trim(),
      category,
      tags: tags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
      ingredients: ingredients.filter((item) => item.name.trim()),
      steps,
      timeMin: timeMin ? Number(timeMin) : null,
      servings: servings ? Number(servings) : null,
      difficulty,
      chef,
      favorite: recipe?.favorite ?? false,
      ratings: recipe?.ratings ?? {},
      sourceUrl: safeUrl(sourceUrl) ?? undefined,
      photoId,
      archived: recipe?.archived,
      regular,
      regularEveryDays: regular ? Math.max(1, Number(regularEveryDays) || 7) : null,
    })
    onSaved?.(saved)
    onClose()
  }

  return (
    <Sheet title={recipe ? 'Редактировать блюдо' : 'Новое блюдо'} onClose={cancel}>
      <div className="stack">
        <Field label="Название">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>

        <div className="row" style={{ alignItems: 'flex-start' }}>
          <div className="grow">
            <Field label="Категория">
              <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
                {categories.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </Field>
          </div>
          <div style={{ width: 96 }}>
            <Field label="Минут">
              <input
                className="input"
                inputMode="numeric"
                value={timeMin}
                onChange={(e) => setTimeMin(e.target.value.replace(/\D/g, ''))}
              />
            </Field>
          </div>
          <div style={{ width: 96 }}>
            <Field label="Порций">
              <input
                className="input"
                inputMode="numeric"
                value={servings}
                onChange={(e) => setServings(e.target.value.replace(/\D/g, ''))}
              />
            </Field>
          </div>
        </div>

        <Field label="Кто обычно готовит">
          <UserPicker value={chef} onChange={(value) => setChef(value as Chef)} allowAny />
        </Field>

        <Field label="Сложность">
          <div className="segmented">
            {([1, 2, 3] as const).map((level) => (
              <button
                key={level}
                className={difficulty === level ? 'active' : ''}
                onClick={() => setDifficulty(level)}
              >
                {level === 1 ? 'Просто' : level === 2 ? 'Средне' : 'Заморочно'}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Теги">
          <input
            className="input"
            placeholder="острое, постное, на праздник"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
          />
        </Field>

        <div className="card" style={{ padding: '4px 14px' }}>
          <label className="switch">
            <span>Едим регулярно</span>
            <input type="checkbox" checked={regular} onChange={(e) => setRegular(e.target.checked)} />
          </label>
          {regular && (
            <div className="row" style={{ paddingBottom: 12 }}>
              <span className="small muted grow">Примерно раз в</span>
              <input
                className="input input-sm"
                style={{ width: 74 }}
                inputMode="numeric"
                value={regularEveryDays}
                onChange={(e) => setRegularEveryDays(e.target.value.replace(/\D/g, ''))}
              />
              <span className="small muted">дней</span>
            </div>
          )}
        </div>

        <div className="field">
          <div className="row-between">
            <label>Ингредиенты</label>
            <div className="segmented">
              <button className={mode === 'rows' ? 'active' : ''} onClick={() => setMode('rows')}>
                Полями
              </button>
              <button
                className={mode === 'text' ? 'active' : ''}
                onClick={() => {
                  setDraftText(ingredientsToText(ingredients))
                  setMode('text')
                }}
              >
                Списком
              </button>
            </div>
          </div>

          {mode === 'text' ? (
            <>
              <textarea
                className="input"
                style={{ minHeight: 150 }}
                placeholder={'Помидоры\nМоцарелла — 200 г\nОливковое масло (по вкусу)'}
                value={draftText}
                onChange={(event) => {
                  setDraftText(event.target.value)
                  setIngredients(parseIngredientList(event.target.value))
                }}
              />
            </>
          ) : (
            <>
              <datalist id="product-names">
                {suggestions.map((item) => (
                  <option key={item} value={item} />
                ))}
              </datalist>
              <div className="stack" style={{ gap: 6 }}>
            {ingredients.map((ingredient, index) => (
              <div className="ingredient-row" key={index}>
                <input
                  className="input input-sm"
                  list="product-names"
                  placeholder="Продукт"
                  value={ingredient.name}
                  onChange={(e) => setIngredient(index, { name: e.target.value })}
                />
                <input
                  className="input input-sm"
                  inputMode="decimal"
                  placeholder="кол-во"
                  value={ingredient.qty ?? ''}
                  onChange={(e) => {
                    const raw = e.target.value.replace(',', '.').replace(/[^\d.]/g, '')
                    setIngredient(index, { qty: raw === '' ? null : Number(raw) })
                  }}
                />
                <select
                  className="input input-sm"
                  value={ingredient.unit}
                  onChange={(e) => setIngredient(index, { unit: e.target.value })}
                >
                  {UNITS.map((unit) => (
                    <option key={unit || 'none'} value={unit}>
                      {unit || '—'}
                    </option>
                  ))}
                </select>
                <button
                  className="icon-btn"
                  onClick={() => setIngredients((list) => list.filter((_, i) => i !== index))}
                  aria-label="Убрать ингредиент"
                >
                  <IconTrash size={17} />
                </button>
              </div>
            ))}
              </div>
              <button
                className="btn btn-sm"
                style={{ alignSelf: 'flex-start', marginTop: 6 }}
                onClick={() => setIngredients((list) => [...list, { ...EMPTY_INGREDIENT }])}
              >
                <IconPlus size={15} /> Ингредиент
              </button>
            </>
          )}
        </div>

        <Field label="Как готовить">
          <textarea className="input" value={steps} onChange={(e) => setSteps(e.target.value)} />
        </Field>

        <Field label="Ссылка на рецепт">
          <input className="input" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} />
        </Field>

        <div className="field">
          <label>Фото</label>
          <div className="row">
            <div style={{ width: 76 }}>
              <Thumb photoId={photoId} />
            </div>
            <label className="btn btn-sm">
              <IconPhoto size={16} />
              {uploading ? 'Загрузка…' : photoId ? 'Заменить' : 'Добавить'}
              <input
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => void onPickPhoto(e.target.files?.[0])}
              />
            </label>
            {photoId && (
              <button className="btn btn-sm btn-ghost" onClick={() => setPhotoId(undefined)}>
                Убрать
              </button>
            )}
          </div>
        </div>

        <div className="row" style={{ marginTop: 6 }}>
          <button className="btn grow" onClick={cancel}>
            Отмена
          </button>
          <button className="btn btn-primary grow" onClick={submit}>
            Сохранить
          </button>
        </div>
      </div>
    </Sheet>
  )
}
