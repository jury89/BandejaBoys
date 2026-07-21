export const AVATAR_EDGE = 160
export const AVATAR_MAX_SOURCE_BYTES = 8 * 1024 * 1024
export const AVATAR_DATA_URL_MAX_LENGTH = 100_000

export interface CoverCrop {
  sx: number
  sy: number
  sourceWidth: number
  sourceHeight: number
}

export function coverCrop(width: number, height: number): CoverCrop {
  if (width <= 0 || height <= 0) throw new Error('Immagine non valida.')
  const side = Math.min(width, height)
  return {
    sx: (width - side) / 2,
    sy: (height - side) / 2,
    sourceWidth: side,
    sourceHeight: side,
  }
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Non riesco a leggere questa immagine. Prova con JPG, PNG o WebP.'))
    }
    image.src = url
  })
}

export async function compressAvatar(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Scegli un file immagine.')
  if (file.size > AVATAR_MAX_SOURCE_BYTES) throw new Error('La foto originale non può superare 8 MB.')

  const image = await loadImage(file)
  const crop = coverCrop(image.naturalWidth, image.naturalHeight)
  const canvas = document.createElement('canvas')
  canvas.width = AVATAR_EDGE
  canvas.height = AVATAR_EDGE
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Il browser non riesce a preparare la foto.')

  context.fillStyle = '#edf5f7'
  context.fillRect(0, 0, AVATAR_EDGE, AVATAR_EDGE)
  context.drawImage(
    image,
    crop.sx,
    crop.sy,
    crop.sourceWidth,
    crop.sourceHeight,
    0,
    0,
    AVATAR_EDGE,
    AVATAR_EDGE,
  )

  let dataUrl = canvas.toDataURL('image/jpeg', 0.82)
  if (dataUrl.length > AVATAR_DATA_URL_MAX_LENGTH) dataUrl = canvas.toDataURL('image/jpeg', 0.62)
  if (dataUrl.length > AVATAR_DATA_URL_MAX_LENGTH) {
    throw new Error('La foto resta troppo pesante. Prova con un’altra immagine.')
  }
  return dataUrl
}
