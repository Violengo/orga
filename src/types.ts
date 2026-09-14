export type Member = {
  id: string
  role: string
  name: string
}

export type OrgNode = {
  id: string
  title: string
  parentId: string | null
  color?: string
  members: Member[]
}

export type OrgChart = {
  id: string
  fileName: string
  title: string
  subtitle: string
  version: string
  accent: string
  logoId?: string
  locationId?: string
  logo?: string
  customLogo?: string
  customAccent?: string
  nodes: OrgNode[]
}

export type PositionedNode = OrgNode & {
  x: number
  y: number
  width: number
  height: number
  depth: number
}
