import type { Member, OrgNode, PositionedNode } from './types'

export const CARD_WIDTH = 230
export const WIDE_CARD_WIDTH = 480
export const COLUMN_GAP = 10
export const FUNCTION_GROUP_INSET = 0
const H_GAP = 36
const V_GAP = 88
const MARGIN = 54
const FUNCTION_GROUP_STEM_GAP = 18
const MEMBER_LEVEL_GAP = 18
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

export const departmentHead = (node: OrgNode) => node.members.find((member) => member.isDepartmentHead)

export const hasMemberHierarchy = (node: OrgNode) => !departmentHead(node) && node.members.some((member) => member.parentMemberId !== undefined)

const hierarchyRoots = (node: OrgNode) => {
  const ids = new Set(node.members.map((member) => member.id))
  return node.members.filter((member) => !member.parentMemberId || !ids.has(member.parentMemberId))
}

const hierarchyLeafCount = (node: OrgNode, member: Member, seen = new Set<string>()): number => {
  if (seen.has(member.id)) return 1
  const nextSeen = new Set(seen).add(member.id)
  const children = node.members.filter((candidate) => candidate.parentMemberId === member.id)
  return children.length ? children.reduce((total, child) => total + hierarchyLeafCount(node, child, nextSeen), 0) : 1
}

export const hierarchyNodeWidth = (node: OrgNode) => {
  const leaves = Math.max(1, hierarchyRoots(node).reduce((total, member) => total + hierarchyLeafCount(node, member), 0))
  return Math.min(840, Math.max(CARD_WIDTH, leaves * 190 + Math.max(0, leaves - 1) * 12))
}

export type PositionedMember = Member & { x: number; y: number; width: number; height: number; depth: number }

export const memberTreeLayout = (node: OrgNode, width = hierarchyNodeWidth(node)) => {
  const roots = hierarchyRoots(node)
  const leaves = Math.max(1, roots.reduce((total, member) => total + hierarchyLeafCount(node, member), 0))
  const gap = 12
  const unitWidth = (width - Math.max(0, leaves - 1) * gap) / leaves
  const cardWidth = leaves === 1 ? width : Math.min(220, Math.max(125, unitWidth))
  const provisional: Array<PositionedMember & { centerUnit: number }> = []

  const place = (member: Member, startUnit: number, depth: number, seen = new Set<string>()) => {
    if (seen.has(member.id)) return
    const nextSeen = new Set(seen).add(member.id)
    const span = hierarchyLeafCount(node, member)
    const centerUnit = startUnit + span / 2
    provisional.push({ ...member, x: 0, y: 0, width: cardWidth, height: memberHeight(member, cardWidth), depth, centerUnit })
    let childStart = startUnit
    node.members.filter((candidate) => candidate.parentMemberId === member.id).forEach((child) => {
      place(child, childStart, depth + 1, nextSeen)
      childStart += hierarchyLeafCount(node, child)
    })
  }
  let rootStart = 0
  roots.forEach((root) => { place(root, rootStart, 0); rootStart += hierarchyLeafCount(node, root) })

  const maxDepth = Math.max(0, ...provisional.map((member) => member.depth))
  const levelTop = new Map<number, number>()
  let top = 0
  for (let depth = 0; depth <= maxDepth; depth += 1) {
    levelTop.set(depth, top)
    top += Math.max(34, ...provisional.filter((member) => member.depth === depth).map((member) => member.height)) + (depth < maxDepth ? MEMBER_LEVEL_GAP : 0)
  }
  const members = provisional.map(({ centerUnit, ...member }) => ({
    ...member,
    x: Math.max(0, Math.min(width - cardWidth, centerUnit * unitWidth + Math.max(0, centerUnit - .5) * gap - cardWidth / 2)),
    y: levelTop.get(member.depth) ?? 0,
  }))
  return { members, height: top }
}

type MemberColumn = { members: OrgNode['members']; height: number; fullWidth?: boolean }

export const isWideNode = (node: OrgNode) => {
  const totalNames = node.members.reduce((total, member) => total + Math.max(1, memberNames(member.name).length), 0)
  const singleColumnHeight = node.members.reduce((total, member) => total + memberHeight(member), 0)
  return node.members.length >= 4 || totalNames >= 9 || singleColumnHeight > 220
}

export const memberColumns = (node: OrgNode): MemberColumn[] => {
  const head = departmentHead(node)
  if (head) {
    const columnWidth = (WIDE_CARD_WIDTH - COLUMN_GAP) / 2
    const columns: MemberColumn[] = [
      { members: [head], height: memberHeight(head, WIDE_CARD_WIDTH), fullWidth: true },
      { members: [], height: 0 },
      { members: [], height: 0 },
    ]
    node.members.filter((member) => member.id !== head.id).forEach((member) => {
      const target = columns[1].height <= columns[2].height ? columns[1] : columns[2]
      target.members.push(member)
      target.height += memberHeight(member, columnWidth)
    })
    return columns
  }
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

export const nodeWidth = (node: OrgNode) => departmentHead(node) ? WIDE_CARD_WIDTH : hasMemberHierarchy(node) ? hierarchyNodeWidth(node) : isWideNode(node) ? WIDE_CARD_WIDTH : CARD_WIDTH

export const departmentIconType = (title: string) => {
  const normalized = title.trim().toLocaleLowerCase('fr')
  if (normalized === 'staff') return 'staff'
  if (normalized === 'operators') return 'operators'
  return null
}

export const nodeTitleLines = (node: OrgNode) => wrapTextLines(node.title, Math.max(18, Math.floor((nodeWidth(node) - 24) / 6.2)))

export const nodeHeaderHeight = (node: OrgNode) => {
  if (node.kind === 'function-group') return FUNCTION_GROUP_INSET
  const titleHeight = nodeTitleLines(node).length * 14
  return departmentIconType(node.title) ? 48 + titleHeight : Math.max(38, 18 + titleHeight)
}

export const memberBox = (node: OrgNode, memberId: string) => {
  const headerHeight = nodeHeaderHeight(node)
  const width = nodeWidth(node)
  if (hasMemberHierarchy(node)) {
    const member = memberTreeLayout(node, width).members.find((candidate) => candidate.id === memberId)
    return member ? { x: member.x, y: headerHeight + member.y, width: member.width, height: member.height } : null
  }
  const columns = memberColumns(node)
  if (columns[0]?.fullWidth) {
    const head = columns[0].members[0]
    const headHeight = memberHeight(head, width)
    if (head.id === memberId) return { x: 0, y: headerHeight, width, height: headHeight }
    const columnWidth = (width - COLUMN_GAP) / 2
    for (let columnIndex = 1; columnIndex <= 2; columnIndex += 1) {
      let top = headerHeight + headHeight
      for (const member of columns[columnIndex].members) {
        const height = memberHeight(member, columnWidth)
        if (member.id === memberId) return { x: (columnIndex - 1) * (columnWidth + COLUMN_GAP), y: top, width: columnWidth, height }
        top += height
      }
    }
    return null
  }
  const columnGap = columns.length > 1 ? COLUMN_GAP : 0
  const columnWidth = (width - columnGap * (columns.length - 1)) / columns.length
  for (let columnIndex = 0; columnIndex < columns.length; columnIndex += 1) {
    let top = headerHeight
    for (const member of columns[columnIndex].members) {
      const height = memberHeight(member, columnWidth)
      if (member.id === memberId) return { x: columnIndex * (columnWidth + columnGap), y: top, width: columnWidth, height }
      top += height
    }
  }
  return null
}

export const nodeHeight = (node: OrgNode) => {
  if (departmentHead(node)) {
    const columns = memberColumns(node)
    return nodeHeaderHeight(node) + columns[0].height + Math.max(34, columns[1].height, columns[2].height)
  }
  return nodeHeaderHeight(node) + (hasMemberHierarchy(node) ? Math.max(34, memberTreeLayout(node).height) : Math.max(34, ...memberColumns(node).map((column) => column.height)))
}

export function layoutNodes(nodes: OrgNode[]) {
  const functionGroups = nodes.filter((node) => Boolean(node.connectorSide) && (node.kind !== 'function-group' || node.members.length > 0))
  const layoutSource = nodes.filter((node) => !node.connectorSide)
  const byId = new Map(layoutSource.map((node) => [node.id, node]))
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

  layoutSource.forEach((node) => getDepth(node))
  const childrenOf = (parentId: string | null) => layoutSource.filter((node) => node.parentId === parentId)
  const roots = layoutSource.filter((node) => !node.parentId || !byId.has(node.parentId))
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
  layoutSource.filter((node) => !visited.has(node.id)).forEach(visit)

  const rowY = new Map<number, number>()
  let y = 112
  for (let depth = 0; depth <= maxDepth; depth += 1) {
    rowY.set(depth, y)
    const maxHeight = Math.max(60, ...(rows.get(depth) ?? []).map(nodeHeight))
    const groupHeight = Math.max(0, ...functionGroups.filter((group) => group.parentId && depths.get(group.parentId) === depth).map(nodeHeight))
    y += maxHeight + V_GAP + (groupHeight ? groupHeight + 34 : 0)
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

  const shiftedById = new Map(positioned.map((node) => [node.id, node]))
  functionGroups.forEach((group) => {
    const parent = group.parentId ? shiftedById.get(group.parentId) : undefined
    if (!parent) return
    const width = nodeWidth(group)
    const height = nodeHeight(group)
    const sameSide = functionGroups.filter((candidate) => candidate.parentId === group.parentId && candidate.connectorSide === group.connectorSide)
    const index = sameSide.findIndex((candidate) => candidate.id === group.id)
    const side = group.connectorSide === 'left' ? -1 : 1
    // Le groupe vit sous la rangée complète : il n'a plus besoin de contourner
    // la largeur du département parent. Seule une courte respiration autour de
    // l'axe vertical est conservée.
    const distance = width / 2 + FUNCTION_GROUP_STEM_GAP + index * (width + H_GAP)
    const positionedGroup: PositionedNode = {
      ...group,
      x: parent.x + parent.width / 2 + side * distance - width / 2,
      y: Math.max(...positioned.filter((candidate) => candidate.depth === parent.depth).map((candidate) => candidate.y + candidate.height)) + 28,
      width,
      height,
      depth: parent.depth + .5,
    }
    positioned.push(positionedGroup)
    shiftedById.set(group.id, positionedGroup)
  })

  // Si plusieurs axes voisins reçoivent des groupes au même étage, on ne les
  // écarte que lorsqu'ils se touchent réellement.
  const groupRows = new Map<number, PositionedNode[]>()
  positioned.filter((node) => node.connectorSide).forEach((node) => {
    groupRows.set(node.y, [...(groupRows.get(node.y) ?? []), node])
  })
  groupRows.forEach((row) => {
    row.sort((left, right) => left.x - right.x)
    const resolved = resolveRowCollisions(row, row.map((node) => node.x))
    row.forEach((node, index) => { node.x = resolved[index] })
  })

  const finalMinX = Math.min(...positioned.map((node) => node.x))
  const finalMaxX = Math.max(...positioned.map((node) => node.x + node.width))
  if (finalMinX < MARGIN || finalMaxX > canvasWidth - MARGIN) {
    const extraLeft = Math.max(0, MARGIN - finalMinX)
    const extraRight = Math.max(0, finalMaxX - canvasWidth + MARGIN)
    positioned.forEach((node) => { node.x += extraLeft })
    return { nodes: positioned, width: Math.ceil(canvasWidth + extraLeft + extraRight), height: Math.max(420, y - V_GAP + MARGIN) }
  }

  return { nodes: positioned, width: canvasWidth, height: Math.max(420, y - V_GAP + MARGIN) }
}
