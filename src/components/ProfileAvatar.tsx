interface ProfileAvatarProps {
  displayName: string
  avatarDataUrl?: string
  className?: string
  decorative?: boolean
}

export function ProfileAvatar({
  displayName,
  avatarDataUrl,
  className = 'avatar',
  decorative = false,
}: ProfileAvatarProps) {
  if (avatarDataUrl) {
    return (
      <img
        className={className}
        src={avatarDataUrl}
        alt={decorative ? '' : `Foto profilo di ${displayName}`}
      />
    )
  }

  return (
    <span className={className} aria-hidden="true">
      {displayName.trim().charAt(0).toUpperCase() || '?'}
    </span>
  )
}
