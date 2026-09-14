export type BrandLogo = {
  id: string
  label: string
  src: string
  accent: string
  family: 'Laurenty' | 'Partenaire'
}

export const LAURENTY_ORANGE = '#EB5D0B'

export const brandLogos: BrandLogo[] = [
  { id: 'laurenty-nettoyage', label: 'Laurenty - Nettoyage', src: '/logos/laurenty-nettoyage.svg', accent: LAURENTY_ORANGE, family: 'Laurenty' },
  { id: 'laurenty-facility', label: 'Laurenty - Facility', src: '/logos/laurenty-facility.svg', accent: LAURENTY_ORANGE, family: 'Laurenty' },
  { id: 'laurenty-espaces-verts', label: 'Laurenty - Espaces verts', src: '/logos/laurenty-espaces-verts.svg', accent: LAURENTY_ORANGE, family: 'Laurenty' },
  { id: 'laurenty-balayage', label: 'Laurenty - Balayage', src: '/logos/laurenty-balayage.svg', accent: LAURENTY_ORANGE, family: 'Laurenty' },
  { id: 'laurenty-batiments', label: 'Laurenty - Bâtiments', src: '/logos/laurenty-batiments.svg', accent: LAURENTY_ORANGE, family: 'Laurenty' },
  { id: 'laurenty-luxembourg', label: 'Laurenty - Luxembourg', src: '/logos/laurenty-luxembourg.svg', accent: LAURENTY_ORANGE, family: 'Laurenty' },
  { id: 'laurenty-group', label: 'Laurenty - Group', src: '/logos/laurenty-group.png', accent: LAURENTY_ORANGE, family: 'Laurenty' },
  { id: 'lgtech', label: 'LGTech', src: '/logos/lgtech.svg', accent: '#1987CE', family: 'Partenaire' },
  { id: 'assurances-mosanes', label: 'Assurances Mosanes', src: '/logos/assurances-mosanes.svg', accent: '#0090D7', family: 'Partenaire' },
]

export const getBrandLogo = (id?: string) => brandLogos.find((logo) => logo.id === id)
