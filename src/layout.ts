import type { Member, OrgNode, PositionedNode } from './types'

export const CARD_WIDTH = 230
export const WIDE_CARD_WIDTH = 480
export const COLUMN_GAP = 10
const H_GAP = 36
const V_GAP = 88
const MARGIN = 54
// Zone occupée en haut par le logo (et, symétriquement, par le cartouche titre).
// Les racines doivent commencer après cette zone tant qu'elles sont sur la même hauteur.
const HEADER_SAFE_EDGE = 350

const isLegacyNamePlaceholder = (value: string) => ['prénom nom', 'nom prénom'].includes(value.trim().toLocaleLowerCase('fr'))

export const memberNames = (name: string) => name.split(/\r?\n|;/).map((value) => value.trim()).filter((value) => Boolean(value) && !isLegacyNamePlaceholder(value))

export const wrapTextLines = (text: string, maxCharacters: number) => {
  const words = text.trim().split(/\s+/).filter(Boolean)
  if (!words.length) return ['']
  const lines: string[] = []
  words.forEach((word) => {
    const current = lines.at(-1)
    if (!current || current.length + word.length + 1 > maxCharacters) lines.push(word)
    else lines[lines.length - 1] = `${current} ${word}`
  })
  return lines
}

export const roleLineCount = (role: string, width = CARD_WIDTH) => wrapTextLines(role, Math.max(16, Math.floor((width - 30) / 5.4))).length

export const memberRoleHeight = (member: Member, width = CARD_WIDTH) => Math.max(20, 6 + roleLineCount(member.role, width) * 14)

export const memberHeight = (member: Member, width = CARD_WIDTH) => memberRoleHeight(member, width) + Math.max(20, 6 + Math.max(1, memberNames(member.name).length) * 14)

type MemberColumn = { members: OrgNode['members']; height: number }

export const isWideNode = (node: OrgNode) => {
  const totalNames = node.members.reduce((total, member) => total + Math.max(1, memberNames(member.name).length), 0)
  const singleColumnHeight = node.members.reduce((total, member) => total + memberHeight(member), 0)
  return node.members.length >= 4 || totalNames >= 9 || singleColumnHeight > 220
}

export const memberColumns = (node: OrgNode): MemberColumn[] => {
  if (!isWideNode(node)) return [{ members: node.members, height: node.members.reduce((total, member) => total + memberHeight(member, CARD_WIDTH), 0) }]
  const columns: MemberColumn[] = [{ members: [], height: 0 }, { members: [], height: 0 }]
  const columnWidth = (WIDE_CARD_WIDTH - COLUMN_GAP) / 2
  node.members.forEach((member) => {
    const target = columns[0].height <= columns[1].height ? columns[0] : columns[1]
    target.members.push(member)
    target.height += memberHeight(member, columnWidth)
  })
  return columns
}

export const nodeWidth = (node: OrgNode) => isWideNode(node) ? WIDE_CARD_WIDTH : CARD_WIDTH

export const departmentIconType = (title: string) => {
  const normalized = title.trim().toLocaleLowerCase('fr')
  if (normalized === 'staff') return 'staff'
  if (normalized === 'operators') return 'operators'
  return null
}

export const nodeTitleLines = (node: OrgNode) => wrapTextLines(node.title, Math.max(18, Math.floor((nodeWidth(node) - 24) / 6.2)))

export const nodeHeaderHeight = (node: OrgNode) => {
  const titleHeight = nodeTitleLines(node).length * 14
  return departmentIconType(node.title) ? 48 + titleHeight : Math.max(38, 18 + titleHeight)
}

export const nodeHeight = (node: OrgNode) => nodeHeaderHeight(node) + Math.max(34, ...memberColumns(node).map((column) => column.height))

export function layoutNodes(nodes: OrgNode[]) {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const depths = new Map<string, number>()

  const getDepth = (node: OrgNode, seen = new Set<string>()): number => {
    if (depths.has(node.id)) return depths.get(node.id)!
    if (!node.parentId || !byId.has(node.parentId) || seen.has(node.id)) {
      depths.set(node.id, 0)
      return 0
    }
    seen.add(node.id)
    const depth = getDepth(byId.get(node.parentId)!, seen) + 1
    depths.set(node.id, depth)
    return depth
  }

  nodes.forEach((node) => getDepth(node))
  const childrenOf = (parentId: string | null) => nodes.filter((node) => node.parentId === parentId)
  const roots = nodes.filter((node) => !node.parentId || !byId.has(node.parentId))
  const maxDepth = Math.max(0, ...depths.values())
  const rows = new Map<number, OrgNode[]>()
  const visited = new Set<string>()
  const visit = (node: OrgNode) => {
    if (visited.has(node.id)) return
    visited.add(node.id)
    const depth = depths.get(node.id) ?? 0
    rows.set(depth, [...(rows.get(depth) ?? []), node])
    childrenOf(node.id).forEach(visit)
  }
  roots.forEach(visit)
  nodes.filter((node) => !visited.has(node.id)).forEach(visit)

  const rowY = new Map<number, number>()
  let y = 112
  for (let depth = 0; depth <= maxDepth; depth += 1) {
    rowY.set(depth, y)
    const maxHeight = Math.max(60, ...(rows.get(depth) ?? []).map(nodeHeight))
    y += maxHeight + V_GAP
  }
  const positioned: PositionedNode[] = []
  const positionedById = new Map<string, PositionedNode>()

  // Projection isotone : conserve au mieux le centre souhaité de chaque carte
  // tout en garantissant l'espacement minimal entre deux voisines.
  const resolveRowCollisions = (row: OrgNode[], desiredLeft: number[]) => {
    const offsets: number[] = []
    let offset = 0
    row.forEach((node, index) => {
      offsets[index] = offset
      offset += nodeWidth(node) + H_GAP
    })
    const blocks = desiredLeft.map((left, index) => ({ start: index, end: index, mean: left - offsets[index], weight: 1 }))
    for (let index = 0; index < blocks.length - 1;) {
      if (blocks[index].mean <= blocks[index + 1].mean) {
        index += 1
        continue
      }
      const left = blocks[index]
      const right = blocks[index + 1]
      const weight = left.weight + right.weight
      blocks.splice(index, 2, {
        start: left.start,
        end: right.end,
        mean: (left.mean * left.weight + right.mean * right.weight) / weight,
        weight,
      })
      if (index > 0) index -= 1
    }
    const resolved = new Array<number>(row.length)
    blocks.forEach((block) => {
      for (let index = block.start; index <= block.end; index += 1) resolved[index] = block.mean + offsets[index]
    })
    return resolved
  }

  for (let depth = 0; depth <= maxDepth; depth += 1) {
    const row = [...(rows.get(depth) ?? [])]
    // Les groupes d'enfants suivent impérativement l'ordre horizontal de leurs
    // parents. Une branche située à droite ne peut ainsi plus repartir à gauche
    // en traversant les liaisons d'une branche voisine.
    if (depth > 0) {
      row.sort((left, right) => {
        const leftParentX = left.parentId ? positionedById.get(left.parentId)?.x ?? 0 : 0
        const rightParentX = right.parentId ? positionedById.get(right.parentId)?.x ?? 0 : 0
        return leftParentX - rightParentX
      })
    }
    const desiredLeft: number[] = []
    const siblingGroups = new Map<string, OrgNode[]>()
    row.forEach((node) => {
      const key = node.parentId ?? '__root__'
      siblingGroups.set(key, [...(siblingGroups.get(key) ?? []), node])
    })

    row.forEach((node, index) => {
      const width = nodeWidth(node)
      if (depth === 0 || !node.parentId || !positionedById.has(node.parentId)) {
        const rootWidth = row.reduce((total, item) => total + nodeWidth(item), 0) + Math.max(0, row.length - 1) * H_GAP
        const precedingWidth = row.slice(0, index).reduce((total, item) => total + nodeWidth(item) + H_GAP, 0)
        desiredLeft[index] = -rootWidth / 2 + precedingWidth
        return
      }
      const parent = positionedById.get(node.parentId)!
      const siblings = siblingGroups.get(node.parentId) ?? [node]
      const groupWidth = siblings.reduce((total, item) => total + nodeWidth(item), 0) + Math.max(0, siblings.length - 1) * H_GAP
      const siblingIndex = siblings.findIndex((item) => item.id === node.id)
      const precedingWidth = siblings.slice(0, siblingIndex).reduce((total, item) => total + nodeWidth(item) + H_GAP, 0)
      // C’est l’encombrement complet du groupe qui est centré sur le parent.
      // Une carte large placée à une extrémité ne crée donc plus de vide artificiel.
      const groupStart = parent.x + parent.width / 2 - groupWidth / 2
      desiredLeft[index] = groupStart + precedingWidth
    })

    const resolvedLeft = resolveRowCollisions(row, desiredLeft)
    const rowMinX = Math.min(...resolvedLeft)
    const rowMaxX = Math.max(...row.map((node, index) => resolvedLeft[index] + nodeWidth(node)))
    const rowShift = -(rowMinX + rowMaxX) / 2
    row.forEach((node, index) => {
      const positionedNode: PositionedNode = {
        ...node,
        x: resolvedLeft[index] + rowShift,
        y: rowY.get(depth) ?? 112,
        width: nodeWidth(node),
        height: nodeHeight(node),
        depth,
      }
      positioned.push(positionedNode)
      positionedById.set(node.id, positionedNode)
    })
  }

  const minX = Math.min(...positioned.map((node) => node.x))
  const maxX = Math.max(...positioned.map((node) => node.x + node.width))
  const rootNodes = positioned.filter((node) => node.depth === 0)
  const rootMinX = Math.min(...rootNodes.map((node) => node.x))
  const rootMaxX = Math.max(...rootNodes.map((node) => node.x + node.width))
  const rootGroupCenter = (rootMinX + rootMaxX) / 2
  const rootGroupWidth = rootMaxX - rootMinX

  // Le groupe racine définit l’axe central du document. Les descendants peuvent
  // être asymétriques sans pousser le ou les départements supérieurs sur le côté.
  const requiredHalfWidth = Math.max(rootGroupCenter - minX, maxX - rootGroupCenter) + MARGIN
  const headerSafeWidth = rootGroupWidth + HEADER_SAFE_EDGE * 2
  const canvasWidth = Math.ceil(Math.max(760, requiredHalfWidth * 2, headerSafeWidth))
  const shiftX = canvasWidth / 2 - rootGroupCenter
  positioned.forEach((node) => { node.x += shiftX })

  return { nodes: positioned, width: canvasWidth, height: Math.max(420, y - V_GAP + MARGIN) }
}
