import { useNavigate } from 'react-router-dom'
import type { Recipe } from '../types'
import { usePhoto } from '../lib/photos'
import { IconClock, IconHeart, IconPot } from './Icons'
import { Avatar } from './ui'
import { daysWord } from '../lib/util'

export function Thumb({ photoId, large }: { photoId?: string; large?: boolean }) {
  const url = usePhoto(photoId)
  if (url) return <img className={large ? 'thumb-lg' : 'thumb'} src={url} alt="" />
  return (
    <div className={large ? 'thumb-lg thumb' : 'thumb'} style={large ? { height: 190 } : undefined}>
      <IconPot size={large ? 40 : 22} />
    </div>
  )
}

export function RecipeRow({
  recipe,
  days,
  reasons,
  right,
  onClick,
}: {
  recipe: Recipe
  days?: number | null
  reasons?: string[]
  right?: React.ReactNode
  onClick?: () => void
}) {
  const navigate = useNavigate()
  return (
    <div className="recipe-row" onClick={onClick ?? (() => navigate(`/recipes/${recipe.id}`))}>
      <Thumb photoId={recipe.photoId} />
      <div className="grow">
        <div className="recipe-title ellipsis">
          {recipe.favorite && <IconHeart size={14} filled style={{ color: 'var(--accent)' }} />}
          <span className="ellipsis">{recipe.name}</span>
        </div>
        <div className="meta">
          <span>{recipe.category}</span>
          {recipe.timeMin != null && (
            <span className="row" style={{ gap: 3 }}>
              <IconClock />
              {recipe.timeMin} мин
            </span>
          )}
          {days != null && <span>{days === 0 ? 'сегодня' : `${daysWord(days)} назад`}</span>}
          {days === null && <span>ни разу</span>}
        </div>
        {reasons && reasons.length > 0 && (
          <div className="reasons">
            {reasons.map((reason) => (
              <span key={reason} className="badge">
                {reason}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="row" style={{ gap: 6, flex: 'none' }}>
        {right}
        {recipe.chef !== 'any' && <Avatar id={recipe.chef} />}
      </div>
    </div>
  )
}
