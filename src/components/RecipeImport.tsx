import { useMemo, useState } from 'react'
import { useStore } from '../lib/store'
import { Field, Sheet, toast } from './ui'
import { IconCheck, IconCopy } from './Icons'
import { buildImportPrompt, parseImportedRecipes, toRecipeDraft, type ImportedRecipe } from '../lib/recipeImport'
import { countOf, formatAmount } from '../lib/util'

/**
 * Импорт рецепта через любой чат-бот: приложение отдаёт готовый запрос,
 * человек вставляет туда ссылку или текст рецепта, а ответ возвращает сюда.
 * Так не приходится вбивать ингредиенты руками.
 */
export function RecipeImport({ onClose }: { onClose: () => void }) {
  const { db, saveRecipe } = useStore()
  const [answer, setAnswer] = useState('')
  const [parsed, setParsed] = useState<ImportedRecipe[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const prompt = useMemo(() => buildImportPrompt(db), [db])

  const copyPrompt = () => {
    void navigator.clipboard.writeText(prompt).then(
      () => toast('Запрос скопирован — вставьте его в чат вместе с рецептом'),
      () => toast('Не удалось скопировать'),
    )
  }

  const check = () => {
    const result = parseImportedRecipes(answer, db)
    setParsed(result.recipes.length ? result.recipes : null)
    setError(result.error)
  }

  const save = () => {
    if (!parsed) return
    for (const recipe of parsed) saveRecipe(toRecipeDraft(recipe))
    toast(parsed.length === 1 ? `«${parsed[0].name}» добавлено` : `Добавлено рецептов: ${parsed.length}`)
    onClose()
  }

  return (
    <Sheet title="Импорт рецепта" onClose={onClose}>
      <div className="stack">
        <div className="small muted">
          Вставьте запрос в любой чат-бот вместе с рецептом, ответ верните сюда.
        </div>

        <button className="btn btn-block" onClick={copyPrompt}>
          <IconCopy size={16} /> Скопировать запрос
        </button>

        <details>
          <summary className="small muted" style={{ cursor: 'pointer' }}>
            Показать текст запроса
          </summary>
          <pre className="prompt-preview">{prompt}</pre>
        </details>

        <Field label="Ответ бота">
          <textarea
            className="input"
            style={{ minHeight: 130, fontFamily: 'ui-monospace, monospace', fontSize: 12.5 }}
            placeholder='{ "name": "…", "ingredients": [ … ] }'
            value={answer}
            onChange={(event) => {
              setAnswer(event.target.value)
              setParsed(null)
              setError(null)
            }}
          />
        </Field>

        {error && (
          <div className="small" style={{ color: 'var(--danger)' }}>
            {error}
          </div>
        )}

        {parsed && (
          <div className="card-flat">
            {parsed.map((recipe, index) => (
              <div key={index} className="shop-item" style={{ cursor: 'default', alignItems: 'flex-start' }}>
                <span className="grow shop-name">
                  {recipe.name}
                  <div className="small muted">
                    {[
                      recipe.category,
                      recipe.timeMin ? `${recipe.timeMin} мин` : null,
                      recipe.servings ? countOf(recipe.servings, 'serving') : null,
                      countOf(recipe.ingredients.length, 'ingredient'),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                  <div className="small muted" style={{ marginTop: 4 }}>
                    {recipe.ingredients
                      .slice(0, 6)
                      .map((item) => [item.name, formatAmount(item.qty, item.unit)].filter(Boolean).join(' '))
                      .join(', ')}
                    {recipe.ingredients.length > 6 ? '…' : ''}
                  </div>
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="row">
          <button className="btn grow" disabled={!answer.trim()} onClick={check}>
            Проверить
          </button>
          <button className="btn btn-primary grow" disabled={!parsed} onClick={save}>
            <IconCheck size={16} /> Добавить
          </button>
        </div>

      </div>
    </Sheet>
  )
}
