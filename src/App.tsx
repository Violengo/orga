import { ChangeEvent, type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Building2,
  AlertTriangle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Download,
  FileJson,
  FileImage,
  FileText,
  GripVertical,
  Hand,
  LayoutDashboard,
  ListTree,
  Minus,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  Redo2,
  Undo2,
  Upload,
  Users,
  X,
} from 'lucide-react'
import { COLUMN_GAP, departmentIconType, hasMemberHierarchy, layoutNodes, memberBox, memberColumns, memberHeight, memberNames, memberRoleHeight, memberTreeLayout, nodeHeaderHeight, nodeTitleLines, roleLineCount, wrapTextLines } from './layout'
import { brandLogos, getBrandLogo } from './brandLogos'
import { sampleChart } from './sampleData'
import type { Member, OrgChart, OrgNode, PositionedNode } from './types'

const STORAGE_KEY = 'laurenty-org-chart-v1'
const ORGCHART_FORMAT = 'laurenty-orgchart'
const ORGCHART_FORMAT_VERSION = 1
const CUSTOM_LOGO_PLACEHOLDER = '/logos/custom-placeholder.svg'
type DropMode = 'before' | 'inside' | 'after'
type ExportFormat = 'pdf' | 'jpg'
type PendingIncompleteAction = { kind: 'save' } | { kind: 'export'; format: ExportFormat }

const CLEANING_LOCATIONS = [
  { value: 'liege', label: 'Liège', fileToken: 'Liege' },
  { value: 'mons', label: 'Mons', fileToken: 'Mons' },
  { value: 'charleroi-namur', label: 'Charleroi/Namur', fileToken: 'Charleroi-Namur' },
  { value: 'flandre', label: 'Flandre', fileToken: 'Flandre' },
  { value: 'bruxelles', label: 'Bruxelles', fileToken: 'Bruxelles' },
]

function entityDocumentDetails(logoId: string, locationId?: string): { fileName: string; title: string; locationId?: string } | undefined {
  if (logoId === 'laurenty-nettoyage') {
    const location = CLEANING_LOCATIONS.find((item) => item.value === locationId) ?? CLEANING_LOCATIONS[0]
    return { locationId: location.value, fileName: `LTY-SA_${location.fileToken}_2026`, title: `Laurenty Nettoyage SA - ${location.label}` }
  }
  const details: Record<string, { fileName: string; title: string }> = {
    'laurenty-luxembourg': { fileName: 'LTY-SARL_Luxembourg', title: 'Laurenty Nettoyage SARL - Luxembourg' },
    'laurenty-balayage': { fileName: 'LTY-BAL_2026', title: 'Laurenty Balayage' },
    'laurenty-espaces-verts': { fileName: 'LTY-EV_2026', title: 'Laurenty Espaces verts' },
    'assurances-mosanes': { fileName: 'AM_2026', title: 'Mosanes' },
    lgtech: { fileName: 'LGT_2026', title: 'LGTech' },
    'laurenty-facility': { fileName: 'LTY-FAC_2026', title: 'Laurenty Facility' },
    'laurenty-batiments': { fileName: 'LTY-BAT_2026', title: 'Laurenty Bâtiments' },
    'laurenty-group': { fileName: 'LTY-GROUP_2026', title: 'Laurenty Group' },
  }
  return details[logoId]
}

type OrgChartFile = {
  format: typeof ORGCHART_FORMAT
  formatVersion: number
  savedAt: string
  chart: OrgChart
}

function roundedConnectorPath(x1: number, y1: number, x2: number, y2: number, lane?: number) {
  if (Math.abs(x1 - x2) < .5) return `M ${x1} ${y1} V ${y2}`
  const mid = lane ?? y1 + (y2 - y1) / 2
  const direction = Math.sign(x2 - x1)
  const radius = Math.min(14, Math.abs(x2 - x1) / 2, Math.abs(mid - y1) / 2, Math.abs(y2 - mid) / 2)
  return `M ${x1} ${y1} V ${mid - radius} Q ${x1} ${mid} ${x1 + direction * radius} ${mid} H ${x2 - direction * radius} Q ${x2} ${mid} ${x2} ${mid + radius} V ${y2}`
}

function functionGroupRootAnchors(node: PositionedNode) {
  if (!node.connectorSide) return []
  if (node.kind !== 'function-group') return [{
    x: node.connectorSide === 'left' ? node.x + node.width : node.x,
    y: node.y + nodeHeaderHeight(node) / 2,
  }]
  const tree = memberTreeLayout(node, node.width)
  const ids = new Set(tree.members.map((member) => member.id))
  return tree.members
    .filter((member) => !member.parentMemberId || !ids.has(member.parentMemberId))
    .map((member) => ({
      x: node.connectorSide === 'left' ? node.x + member.x + member.width : node.x + member.x,
      y: node.y + member.y + memberRoleHeight(member, member.width) / 2,
    }))
}

function consolidatedFunctionGroupPaths(nodes: PositionedNode[]) {
  const positioned = new Map(nodes.map((node) => [node.id, node]))
  const byParent = new Map<string, Array<{ x: number; y: number }>>()
  nodes.filter((node) => node.connectorSide && node.parentId).forEach((node) => {
    byParent.set(node.parentId!, [...(byParent.get(node.parentId!) ?? []), ...functionGroupRootAnchors(node)])
  })
  return [...byParent.entries()].flatMap(([parentId, rawAnchors]) => {
    const parent = positioned.get(parentId)
    if (!parent || rawAnchors.length === 0) return []
    const x = parent.x + parent.width / 2
    const y = parent.y + parent.height
    const anchors = rawAnchors.filter((anchor, index) => rawAnchors.findIndex((candidate) => Math.abs(candidate.x - anchor.x) < .5 && Math.abs(candidate.y - anchor.y) < .5) === index)
    const maxY = Math.max(...anchors.map((anchor) => anchor.y))
    const branches = anchors.map((anchor) => `M ${x} ${anchor.y} H ${anchor.x}`).join(' ')
    const hasRegularContinuation = nodes.some((node) => node.parentId === parentId && !node.connectorSide && Math.abs(connectorSource(parent, node).x - x) < .5)
    const trunk = hasRegularContinuation ? '' : `M ${x} ${y} V ${maxY}`
    return [{ parentId, d: `${trunk} ${branches}`.trim() }]
  })
}

function connectorLane(nodes: PositionedNode[], parent: PositionedNode, childDepth: number) {
  // Toutes les liaisons entre deux rangées circulent sous la carte la plus haute
  // de la rangée parente : une carte voisine ne peut donc jamais les masquer.
  const rowBottom = Math.max(...nodes.filter((node) => node.depth === parent.depth).map((node) => node.y + node.height))
  const attachedGroupBottom = Number.isInteger(childDepth)
    ? Math.max(0, ...nodes.filter((node) => node.connectorSide && node.parentId === parent.id).map((node) => node.y + node.height + 20))
    : 0
  const parentBottom = Math.max(rowBottom, attachedGroupBottom)
  const childTop = Math.min(...nodes.filter((node) => node.depth === childDepth).map((node) => node.y))
  const parentsWithChildren = nodes
    .filter((node) => node.depth === parent.depth && nodes.some((candidate) => candidate.parentId === node.id && candidate.depth === childDepth))
    .sort((left, right) => left.x - right.x)
  const laneIndex = Math.max(0, parentsWithChildren.findIndex((node) => node.id === parent.id))
  return parentBottom + (childTop - parentBottom) * ((laneIndex + 1) / (parentsWithChildren.length + 1))
}

function departmentConnectorPath(nodes: PositionedNode[], parent: PositionedNode, child: PositionedNode) {
  const x1 = connectorSource(parent, child).x
  const y1 = parent.y + parent.height
  const x2 = connectorTargetX(parent, child)
  const y2 = child.y
  const sameDepth = nodes.filter((node) => node.depth === child.depth && !node.connectorSide)
  const firstRowTop = Math.min(...sameDepth.map((node) => node.y))
  if (child.y <= firstRowTop + .5) return roundedConnectorPath(x1, y1, x2, y2, connectorLane(nodes, parent, child.depth))
  const outsideX = Math.min(...sameDepth.map((node) => node.x)) - 28
  const topLane = firstRowTop - 28
  const bottomLane = child.y - 28
  return `M ${x1} ${y1} V ${topLane} H ${outsideX} V ${bottomLane} H ${x2} V ${y2}`
}

function connectorTargetX(parent: PositionedNode, child: PositionedNode) {
  const parentCenter = parent.x + parent.width / 2
  const childCenter = child.x + child.width / 2
  const delta = childCenter - parentCenter
  // Un micro-décalage produit une bosse visuelle. Dans ce cas, on assume
  // un ancrage légèrement à gauche, suffisamment marqué pour être élégant.
  if (Math.abs(delta) >= .5 && Math.abs(delta) < 28) return childCenter - Math.min(34, child.width * .16)
  return childCenter
}

function normalizedLabel(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr').replace(/[^a-z0-9]+/g, ' ').trim()
}

function operatorsAnchorMember(parent: OrgNode, child: OrgNode) {
  if (normalizedLabel(child.title) !== 'operators') return null
  const supervisors = parent.members.filter((member) => normalizedLabel(member.role).includes('area supervisor'))
  return supervisors.find((member) => {
    const role = normalizedLabel(member.role)
    return role.includes('account supervisor') && role.includes('site supervisor')
  }) ?? supervisors.find((member) => {
    const role = normalizedLabel(member.role)
    return role.includes('account supervisor') || role.includes('site supervisor')
  }) ?? supervisors[0] ?? null
}

function connectorSource(parent: PositionedNode, child: PositionedNode) {
  const member = operatorsAnchorMember(parent, child)
  const box = member ? memberBox(parent, member.id) : null
  return {
    x: box ? parent.x + box.x + box.width / 2 : parent.x + parent.width / 2,
  }
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.download = filename
  link.href = url
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function safeFileName(value: string) {
  const cleaned = value.replace(/\.orgchart$/i, '').replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-').replace(/\s+/g, ' ').trim()
  return cleaned || 'Organigramme'
}

function hasHierarchyCycle(nodes: OrgNode[]) {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  return nodes.some((node) => {
    const visited = new Set<string>()
    let current: OrgNode | undefined = node
    while (current?.parentId) {
      if (visited.has(current.id)) return true
      visited.add(current.id)
      current = byId.get(current.parentId)
    }
    return false
  })
}

export function normalizeChart(value: unknown): OrgChart | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Partial<OrgChart>
  if (typeof candidate.id !== 'string' || !Array.isArray(candidate.nodes)) return null
  if (candidate.nodes.some((node) => !node || typeof node.id !== 'string' || typeof node.title !== 'string' || !Array.isArray(node.members))) return null
  const ids = new Set(candidate.nodes.map((node) => node.id))
  if (ids.size !== candidate.nodes.length) return null
  if (candidate.nodes.some((node) => node.parentId !== null && (typeof node.parentId !== 'string' || !ids.has(node.parentId)))) return null
  if (hasHierarchyCycle(candidate.nodes)) return null
  if (candidate.nodes.some((node) => node.members.some((member) => !member || typeof member.id !== 'string' || typeof member.role !== 'string' || typeof member.name !== 'string'))) return null

  const logoId = typeof candidate.logoId === 'string' ? candidate.logoId : candidate.logo ? 'custom' : 'laurenty-nettoyage'
  const brand = getBrandLogo(logoId)
  return {
    id: candidate.id,
    fileName: typeof candidate.fileName === 'string' && candidate.fileName.trim() ? safeFileName(candidate.fileName) : safeFileName(candidate.title || candidate.id),
    title: typeof candidate.title === 'string' ? candidate.title : '',
    subtitle: typeof candidate.subtitle === 'string' ? candidate.subtitle : '',
    version: typeof candidate.version === 'string' ? candidate.version : '',
    accent: brand?.accent ?? (typeof candidate.accent === 'string' ? candidate.accent : '#EB5D0B'),
    logoId,
    locationId: typeof candidate.locationId === 'string' ? candidate.locationId : logoId === 'laurenty-nettoyage' ? 'liege' : undefined,
    logo: brand?.src ?? (typeof candidate.logo === 'string' ? candidate.logo : undefined),
    customLogo: typeof candidate.customLogo === 'string' ? candidate.customLogo : logoId === 'custom' && candidate.logo && candidate.logo !== CUSTOM_LOGO_PLACEHOLDER ? candidate.logo : undefined,
    customAccent: typeof candidate.customAccent === 'string' ? candidate.customAccent : undefined,
    nodes: candidate.nodes.map((node) => {
      const memberIds = new Set(node.members.map((member) => member.id))
      return {
        ...node,
        title: node.kind === 'function-group' && node.title.trim().toLocaleLowerCase('fr') === 'branche de fonctions' ? 'AUX' : node.title,
        members: node.members.map((member) => ({
          ...member,
          ...(member.parentMemberId !== undefined ? { parentMemberId: member.parentMemberId && memberIds.has(member.parentMemberId) ? member.parentMemberId : null } : {}),
        })),
      }
    }),
  }
}

function makeOrgChartFile(chart: OrgChart): OrgChartFile {
  return { format: ORGCHART_FORMAT, formatVersion: ORGCHART_FORMAT_VERSION, savedAt: new Date().toISOString(), chart }
}

const loadImage = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => {
  const image = new Image()
  image.onload = () => resolve(image)
  image.onerror = reject
  image.src = src
})

const channelLuminance = (value: number) => {
  const channel = value / 255
  return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4
}

async function dominantContrastingColor(src: string) {
  const image = await loadImage(src)
  const canvas = document.createElement('canvas')
  canvas.width = 72
  canvas.height = 72
  const context = canvas.getContext('2d', { willReadFrequently: true })!
  const ratio = Math.min(canvas.width / image.width, canvas.height / image.height)
  const width = image.width * ratio
  const height = image.height * ratio
  context.drawImage(image, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height)
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
  const buckets = new Map<string, { count: number; r: number; g: number; b: number }>()
  for (let index = 0; index < pixels.length; index += 16) {
    const r = pixels[index]
    const g = pixels[index + 1]
    const b = pixels[index + 2]
    const alpha = pixels[index + 3]
    if (alpha < 150 || (r > 242 && g > 242 && b > 242)) continue
    const key = `${Math.round(r / 24)}-${Math.round(g / 24)}-${Math.round(b / 24)}`
    const bucket = buckets.get(key) ?? { count: 0, r: 0, g: 0, b: 0 }
    bucket.count += 1
    bucket.r += r
    bucket.g += g
    bucket.b += b
    buckets.set(key, bucket)
  }
  const candidates = [...buckets.values()].map((bucket) => {
    const r = Math.round(bucket.r / bucket.count)
    const g = Math.round(bucket.g / bucket.count)
    const b = Math.round(bucket.b / bucket.count)
    const luminance = .2126 * channelLuminance(r) + .7152 * channelLuminance(g) + .0722 * channelLuminance(b)
    return { ...bucket, r, g, b, contrast: 1.05 / (luminance + .05) }
  }).filter((color) => color.contrast >= 4.5).sort((left, right) => right.count - left.count)
  const dominant = candidates[0]
  if (!dominant) return '#6B7280'
  return `#${[dominant.r, dominant.g, dominant.b].map((value) => value.toString(16).padStart(2, '0')).join('').toUpperCase()}`
}

async function renderExportCanvas(chart: OrgChart, layout: ReturnType<typeof layoutNodes>, scale = 2) {
  await document.fonts.ready
  const canvas = document.createElement('canvas')
  canvas.width = layout.width * scale
  canvas.height = layout.height * scale
  const context = canvas.getContext('2d')!
  context.scale(scale, scale)
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, layout.width, layout.height)

  context.fillStyle = '#23262b'
  context.font = '700 18px "Open Sans", sans-serif'
  context.textAlign = 'right'
  context.fillText(chart.title, layout.width - 46, 54)
  context.fillStyle = '#8f9398'
  context.font = '12px "Open Sans", sans-serif'
  context.fillText(chart.subtitle, layout.width - 46, 74)

  if (chart.logo) {
    try {
      const image = await loadImage(chart.logo)
      const ratio = Math.min(280 / image.width, 145 / image.height)
      context.drawImage(image, 46, 28, image.width * ratio, image.height * ratio)
    } catch { /* Le titre de remplacement reste visible. */ }
  } else {
    context.textAlign = 'left'
    context.fillStyle = '#23262b'
    context.font = '700 23px "Open Sans", sans-serif'
    context.fillText('LAURENTY', 46, 58)
    context.fillStyle = chart.accent
    context.font = '8px "Open Sans", sans-serif'
    context.fillText('NETTOYAGE · SCHOONMAAK', 46, 72)
  }

  const positioned = new Map(layout.nodes.map((node) => [node.id, node]))
  context.strokeStyle = '#aeb2b5'
  context.lineWidth = 1.4
  layout.nodes.filter((node) => !node.connectorSide).forEach((node) => {
    if (!node.parentId) return
    const parent = positioned.get(node.parentId)
    if (!parent) return
    context.stroke(new Path2D(departmentConnectorPath(layout.nodes, parent, node)))
  })
  consolidatedFunctionGroupPaths(layout.nodes).forEach(({ d }) => context.stroke(new Path2D(d)))

  layout.nodes.forEach((node) => {
    const accent = node.color || chart.accent
    const iconType = departmentIconType(node.title)
    const isStaff = iconType === 'staff'
    const isFunctionGroup = node.kind === 'function-group'
    const headerHeight = nodeHeaderHeight(node)
    const headerWidth = isStaff ? Math.min(230, node.width) : node.width
    const headerLeft = node.x + (node.width - headerWidth) / 2
    if (!isStaff && !isFunctionGroup) {
      context.fillStyle = '#ffffff'
      context.strokeStyle = accent
      context.lineWidth = 1
      context.beginPath()
      context.roundRect(node.x, node.y, node.width, node.height, 10)
      context.fill()
      context.stroke()
    }
    if (!isFunctionGroup) {
      context.save()
      context.beginPath()
      context.roundRect(headerLeft, node.y, headerWidth, headerHeight, isStaff ? headerHeight / 2 : 10)
      context.clip()
      context.fillStyle = accent
      context.fillRect(headerLeft, node.y, headerWidth, headerHeight)
      context.restore()
    }

    if (iconType) {
      const iconX = node.x + node.width / 2
      const iconY = node.y + 17
      context.save()
      context.fillStyle = '#ffffff'
      if (iconType === 'staff') {
        context.beginPath()
        context.arc(iconX, iconY - 4, 4.3, 0, Math.PI * 2)
        context.arc(iconX - 10, iconY - 2, 3, 0, Math.PI * 2)
        context.arc(iconX + 10, iconY - 2, 3, 0, Math.PI * 2)
        context.fill()
        context.beginPath()
        context.roundRect(iconX - 8, iconY + 2, 16, 8, 4)
        context.roundRect(iconX - 16, iconY + 3, 7, 7, 3)
        context.roundRect(iconX + 9, iconY + 3, 7, 7, 3)
        context.fill()
      } else {
        context.translate(iconX, iconY)
        for (let tooth = 0; tooth < 8; tooth += 1) {
          context.save()
          context.rotate(tooth * Math.PI / 4)
          context.fillRect(-2.5, -12, 5, 6)
          context.restore()
        }
        context.beginPath()
        context.arc(0, 0, 8.5, 0, Math.PI * 2)
        context.fill()
        context.fillStyle = accent
        context.beginPath()
        context.arc(0, 0, 3.5, 0, Math.PI * 2)
        context.fill()
      }
      context.restore()
    }
    if (!isFunctionGroup) {
      context.fillStyle = '#ffffff'
      context.font = '700 10px "Open Sans", sans-serif'
      context.textAlign = 'center'
      const titleLines = nodeTitleLines(node).map((line) => line.toUpperCase())
      const titleStartY = node.y + headerHeight - 11 - (titleLines.length - 1) * 7
      titleLines.forEach((line, index) => context.fillText(line, node.x + node.width / 2, titleStartY + index * 14))
    }

    const drawMember = (member: Member, left: number, top: number, width: number) => {
        const height = memberHeight(member, width)
        const roleHeight = memberRoleHeight(member, width)
        const roleLines = wrapTextLines(member.role, Math.max(16, Math.floor((width - 30) / 5.4)))
        context.fillStyle = '#dedcd4'
        context.fillRect(left + 1, top, width - 2, roleHeight)
        context.fillStyle = '#50565f'
        context.font = '700 9px "Open Sans", sans-serif'
        const roleStartY = top + roleHeight / 2 - (roleLines.length - 1) * 7 + 3
        roleLines.forEach((line, index) => context.fillText(line, left + width / 2, roleStartY + index * 14))
        context.fillStyle = '#ffffff'
        context.fillRect(left + 1, top + roleHeight, width - 2, height - roleHeight)
        context.fillStyle = '#646a72'
        context.font = '9px "Open Sans", sans-serif'
        memberNames(member.name).forEach((name, nameIndex) => context.fillText(name, left + width / 2, top + roleHeight + 14 + nameIndex * 14))
        return height
    }
    if (hasMemberHierarchy(node)) {
      const tree = memberTreeLayout(node, node.width)
      context.strokeStyle = '#aeb2b5'
      context.lineWidth = 1
      tree.members.filter((member) => member.parentMemberId).forEach((member) => {
        const parent = tree.members.find((candidate) => candidate.id === member.parentMemberId)
        if (!parent) return
        const bodyTop = node.y + headerHeight
        const path = new Path2D(roundedConnectorPath(node.x + parent.x + parent.width / 2, bodyTop + parent.y + parent.height, node.x + member.x + member.width / 2, bodyTop + member.y))
        context.stroke(path)
      })
      if (departmentIconType(node.title) === 'staff') {
        const centered = tree.members.filter((member) => Math.abs(member.x + member.width / 2 - node.width / 2) < 1).sort((left, right) => right.depth - left.depth)[0]
        if (centered) {
          context.beginPath()
          context.moveTo(node.x + node.width / 2, node.y + headerHeight + centered.y + centered.height)
          context.lineTo(node.x + node.width / 2, node.y + node.height)
          context.stroke()
        }
      }
      tree.members.forEach((member) => drawMember(member, node.x + member.x, node.y + headerHeight + member.y, member.width))
    } else {
      const columns = memberColumns(node)
      if (columns[0]?.fullWidth) {
        let top = node.y + headerHeight
        columns[0].members.forEach((member) => { top += drawMember(member, node.x, top, node.width) })
        const columnWidth = (node.width - COLUMN_GAP) / 2
        columns.slice(1).forEach((column, columnIndex) => {
          let columnTop = top
          column.members.forEach((member) => { columnTop += drawMember(member, node.x + columnIndex * (columnWidth + COLUMN_GAP), columnTop, columnWidth) })
        })
      } else {
        const columnGap = columns.length > 1 ? COLUMN_GAP : 0
        columns.forEach((column, columnIndex) => {
          const columnWidth = (node.width - columnGap * (columns.length - 1)) / columns.length
          const left = node.x + columnIndex * (columnWidth + columnGap)
          let top = node.y + headerHeight
          column.members.forEach((member) => { top += drawMember(member, left, top, columnWidth) })
        })
      }
    }

    chart.nodes.filter((child) => child.parentId === node.id).forEach((child) => {
      const member = operatorsAnchorMember(node, child)
      const box = member ? memberBox(node, member.id) : null
      if (!box) return
      const x = node.x + box.x + box.width / 2
      const y = node.y + box.y + box.height
      context.strokeStyle = '#aeb2b5'
      context.lineWidth = 1.4
      context.beginPath()
      context.moveTo(x, y)
      context.lineTo(x, node.y + node.height)
      context.stroke()
    })

    // La bordure est tracée en dernier : les aplats des fonctions ne peuvent
    // ainsi plus recouvrir le trait inférieur ni ses angles arrondis à l’export.
    if (!isStaff && !isFunctionGroup) {
      context.strokeStyle = accent
      context.lineWidth = 1
      context.beginPath()
      context.roundRect(node.x + .5, node.y + .5, node.width - 1, node.height - 1, 9.5)
      context.stroke()
    }
  })

  context.textAlign = 'right'
  context.fillStyle = '#8e9195'
  context.font = '700 9px "Open Sans", sans-serif'
  context.fillText(chart.version, layout.width - 28, layout.height - 24)
  return canvas
}

function loadChart(): OrgChart {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (!saved) return sampleChart
    return normalizeChart(JSON.parse(saved)) ?? sampleChart
  } catch {
    return sampleChart
  }
}

const makeId = () => crypto.randomUUID()

const editableMemberNames = (value: string) => value.split(/\r?\n|;/).map((name) => ['prénom nom', 'nom prénom'].includes(name.trim().toLocaleLowerCase('fr')) ? '' : name)

function formatCollaboratorName(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return ''
  const firstName = parts[0].split(/([-’'])/).map((part) => /^[-’']$/.test(part) ? part : `${part.charAt(0).toLocaleUpperCase('fr')}${part.slice(1).toLocaleLowerCase('fr')}`).join('')
  return [firstName, ...parts.slice(1).map((part) => part.toLocaleUpperCase('fr'))].join(' ')
}

const formatCollaboratorList = (value: string) => value.split(/\r?\n|;/).map(formatCollaboratorName).join('\n')

function countEmptyFields(chart: OrgChart) {
  const missingMetadata = [chart.fileName, chart.title].filter((value) => !value.trim() || value.trim().toUpperCase() === 'XXXXXXXX').length
  return chart.nodes.reduce((total, node) => {
    let count = total + (node.title.trim() ? 0 : 1)
    if (!node.members.length) return count + 1
    node.members.forEach((member) => {
      if (!member.role.trim()) count += 1
      const names = member.name.split(/\r?\n|;/)
      count += memberNames(member.name).length ? names.filter((name) => !name.trim()).length : 1
    })
    return count
  }, missingMetadata)
}

function branchNodeIds(nodes: OrgNode[], rootId: string) {
  const ids = new Set([rootId])
  let changed = true
  while (changed) {
    changed = false
    nodes.forEach((node) => {
      if (node.parentId && ids.has(node.parentId) && !ids.has(node.id)) {
        ids.add(node.id)
        changed = true
      }
    })
  }
  return ids
}

function memberBranchIds(members: Member[], rootId: string) {
  const ids = new Set([rootId])
  let changed = true
  while (changed) {
    changed = false
    members.forEach((member) => {
      if (member.parentMemberId && ids.has(member.parentMemberId) && !ids.has(member.id)) {
        ids.add(member.id)
        changed = true
      }
    })
  }
  return ids
}

function DepartmentIcon({ type }: { type: 'staff' | 'operators' }) {
  if (type === 'staff') {
    return <svg className="department-type-icon" viewBox="0 0 40 28" aria-hidden="true">
      <circle cx="20" cy="7" r="5" />
      <circle cx="8" cy="10" r="3.5" />
      <circle cx="32" cy="10" r="3.5" />
      <path d="M11 25v-5.2C11 15.5 14.7 13 20 13s9 2.5 9 6.8V25H11Z" />
      <path d="M1.5 25v-4c0-3.4 2.6-5.4 6.5-5.4 1.1 0 2.1.2 3 .5-1.4 1.4-2 3.2-2 5.4V25H1.5Zm37 0H31v-3.5c0-2.2-.6-4-2-5.4.9-.3 1.9-.5 3-.5 3.9 0 6.5 2 6.5 5.4v4Z" />
    </svg>
  }
  return <svg className="department-type-icon" viewBox="0 0 32 32" aria-hidden="true">
    <path fillRule="evenodd" d="m18.6 2 .7 3.5c.8.3 1.5.7 2.2 1.3l3.4-1.1 2.6 4.5-2.7 2.4a10 10 0 0 1 0 2.8l2.7 2.4-2.6 4.5-3.4-1.1c-.7.6-1.4 1-2.2 1.3l-.7 3.5h-5.2l-.7-3.5a10 10 0 0 1-2.2-1.3l-3.4 1.1-2.6-4.5 2.7-2.4a10 10 0 0 1 0-2.8l-2.7-2.4 2.6-4.5 3.4 1.1c.7-.6 1.4-1 2.2-1.3l.7-3.5h5.2ZM16 10a5 5 0 1 0 0 10 5 5 0 0 0 0-10Z" />
  </svg>
}

type DropdownOption = { value: string; label: string; group?: string }

function Dropdown({ label, value, options, onChange }: { label: string; value: string; options: DropdownOption[]; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const selectedOption = options.find((option) => option.value === value) ?? options[0]

  useEffect(() => {
    if (!open) return
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const closeWithEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    window.addEventListener('keydown', closeWithEscape)
    return () => {
      document.removeEventListener('pointerdown', close)
      window.removeEventListener('keydown', closeWithEscape)
    }
  }, [open])

  let previousGroup: string | undefined
  return <div className={`custom-dropdown ${open ? 'open' : ''}`} ref={rootRef}>
    <button type="button" className="custom-dropdown-trigger" aria-label={label} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
      <span>{selectedOption?.label}</span><ChevronDown size={16} />
    </button>
    {open && <div className="custom-dropdown-menu" role="listbox" aria-label={label}>
      {options.map((option) => {
        const showGroup = option.group && option.group !== previousGroup
        previousGroup = option.group
        return <div key={option.value}>
          {showGroup && <div className="custom-dropdown-group">{option.group}</div>}
          <button type="button" role="option" aria-selected={option.value === value} className={option.value === value ? 'selected' : ''} onClick={() => { onChange(option.value); setOpen(false) }}>
            <span>{option.label}</span>{option.value === value && <span className="selection-mark">✓</span>}
          </button>
        </div>
      })}
    </div>}
  </div>
}

function NodeCard({
  node,
  accent,
  selected,
  dimmed,
  onSelect,
  onUpdateNode,
  onUpdateMember,
  onAddFirstFunction,
  onAddCollaborator,
  onUpdateCollaborator,
  onRemoveCollaborator,
  anchoredMemberIds,
  selectedMemberId,
  onSelectMember,
  onRequestDeleteMember,
}: {
  node: PositionedNode
  accent: string
  selected: boolean
  dimmed: boolean
  onSelect: (additive: boolean, revealInspector?: boolean) => void
  onUpdateNode: (patch: Partial<OrgNode>) => void
  onUpdateMember: (memberId: string, patch: Partial<Member>) => void
  onAddFirstFunction: () => void
  onAddCollaborator: (memberId: string) => void
  onUpdateCollaborator: (memberId: string, index: number, value: string) => void
  onRemoveCollaborator: (memberId: string, index: number) => void
  anchoredMemberIds: string[]
  selectedMemberId: string | null
  onSelectMember: (memberId: string) => void
  onRequestDeleteMember: (memberId: string) => void
}) {
  const columns = memberColumns(node)
  const hasDepartmentHead = Boolean(columns[0]?.fullWidth)
  const tree = hasMemberHierarchy(node) ? memberTreeLayout(node, node.width) : null
  const iconType = departmentIconType(node.title)
  const isStaff = iconType === 'staff'
  const isFunctionGroup = node.kind === 'function-group'
  const titleRows = nodeTitleLines(node).length
  const renderMember = (member: Member, width: number, style?: CSSProperties) => <div className={`member ${selectedMemberId === member.id ? 'selected-function' : ''}`} key={member.id} style={style} onClick={(event) => { event.stopPropagation(); onSelectMember(member.id) }}>
    <div className="member-role-row">
      <textarea spellCheck={false} autoCorrect="off" rows={roleLineCount(member.role, width)} aria-label={`Nom de la fonction ${member.role}`} placeholder="Nom de la fonction" value={member.role} onClick={(event) => { event.stopPropagation(); onSelectMember(member.id) }} onChange={(event) => onUpdateMember(member.id, { role: event.target.value })} />
      <button aria-label={`Ajouter un collaborateur à ${member.role}`} title="Ajouter un collaborateur" onClick={(event) => { event.stopPropagation(); onAddCollaborator(member.id) }}><Plus size={12} /></button>
      {selectedMemberId === member.id && <button className="member-delete" aria-label={`Supprimer la fonction ${member.role}`} title="Supprimer cette fonction" onClick={(event) => { event.stopPropagation(); onRequestDeleteMember(member.id) }}><Trash2 size={11} /></button>}
    </div>
    <div className="member-names">
      {editableMemberNames(member.name).map((name, index, names) => <div className="member-name-row" key={`${member.id}-${index}`}>
        <input
          spellCheck={false}
          autoCorrect="off"
          aria-label={`Collaborateur ${index + 1} de ${member.role}`}
          value={name}
          onClick={(event) => { event.stopPropagation(); onSelectMember(member.id) }}
          placeholder="Nom Prénom"
          onChange={(event) => onUpdateCollaborator(member.id, index, event.target.value)}
          onBlur={(event) => onUpdateCollaborator(member.id, index, formatCollaboratorName(event.target.value))}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' || index !== names.length - 1 || !name.trim() || event.currentTarget.selectionStart !== name.length) return
            event.preventDefault()
            const memberElement = event.currentTarget.closest('.member')
            onAddCollaborator(member.id)
            window.requestAnimationFrame(() => {
              const inputs = memberElement?.querySelectorAll<HTMLInputElement>('.member-name-row input')
              inputs?.item(inputs.length - 1).focus()
            })
          }}
        />
        <button aria-label={`Supprimer ${name || 'ce collaborateur'}`} title="Supprimer ce collaborateur" onClick={(event) => { event.stopPropagation(); onRemoveCollaborator(member.id, index) }}><X size={11} /></button>
      </div>)}
    </div>
  </div>
  return (
    <article
      className={`org-card ${isStaff ? 'staff-card' : ''} ${isFunctionGroup ? 'function-group-card' : ''} ${selected ? 'selected' : ''} ${dimmed ? 'dimmed' : ''}`}
      style={{ left: node.x, top: node.y, width: node.width, minHeight: node.height, '--node-accent': node.color || accent } as React.CSSProperties}
      onClick={(event) => { event.stopPropagation(); onSelect(event.ctrlKey || event.metaKey) }}
    >
      {!isFunctionGroup && <header className={iconType ? 'with-department-icon' : ''}>
        {iconType && <DepartmentIcon type={iconType} />}
        <textarea spellCheck={false} autoCorrect="off" rows={titleRows} aria-label={`Nom du département ${node.title}`} value={node.title} onClick={(event) => { event.stopPropagation(); onSelect(event.ctrlKey || event.metaKey, false) }} onChange={(event) => onUpdateNode({ title: event.target.value })} />
      </header>}
      <div className={`members ${columns.length > 1 && !tree && !hasDepartmentHead ? 'two-columns' : ''} ${hasDepartmentHead ? 'department-head-layout' : ''} ${tree ? 'function-hierarchy' : ''}`} style={tree ? { height: tree.height } : undefined}>
        {node.members.length === 0 && <button className="empty-member" onClick={(event) => {
          event.stopPropagation()
          const card = event.currentTarget.closest('.org-card')
          onSelect(false, false)
          onAddFirstFunction()
          window.requestAnimationFrame(() => {
            const field = card?.querySelector<HTMLTextAreaElement>('.member-role-row textarea')
            field?.focus()
            field?.select()
          })
        }}><Plus size={11} />Ajouter une première fonction</button>}
        {tree && <>
          <svg className="function-connectors" width={node.width} height={tree.height} aria-hidden="true">
            {tree.members.filter((member) => member.parentMemberId).map((member) => {
              const parent = tree.members.find((candidate) => candidate.id === member.parentMemberId)
              if (!parent) return null
              return <path key={member.id} d={roundedConnectorPath(parent.x + parent.width / 2, parent.y + parent.height, member.x + member.width / 2, member.y)} />
            })}
            {isStaff && (() => {
              const centered = tree.members.filter((member) => Math.abs(member.x + member.width / 2 - node.width / 2) < 1).sort((left, right) => right.depth - left.depth)[0]
              return centered ? <path d={`M ${node.width / 2} ${centered.y + centered.height} V ${tree.height}`} /> : null
            })()}
          </svg>
          {tree.members.map((member) => renderMember(member, member.width, { position: 'absolute', left: member.x, top: member.y, width: member.width, minHeight: member.height }))}
        </>}
        {!tree && columns[0]?.fullWidth && <>
          <div className="member-column department-head-row">{columns[0].members.map((member) => renderMember(member, node.width))}</div>
          <div className="department-head-children">
            {columns.slice(1).map((column, columnIndex) => <div className="member-column" key={columnIndex}>{column.members.map((member) => renderMember(member, (node.width - COLUMN_GAP) / 2))}</div>)}
          </div>
        </>}
        {!tree && !columns[0]?.fullWidth && columns.map((column, columnIndex) => {
          const columnWidth = (node.width - (columns.length - 1) * COLUMN_GAP) / columns.length
          return <div className="member-column" key={columnIndex}>{column.members.map((member) => renderMember(member, columnWidth))}</div>
        })}
      </div>
      {anchoredMemberIds.map((memberId) => {
        const box = memberBox(node, memberId)
        if (!box) return null
        return <span key={memberId} className="member-department-anchor" style={{ left: box.x + box.width / 2, top: box.y + box.height, height: Math.max(0, node.height - box.y - box.height) }} />
      })}
    </article>
  )
}

function ListView({ chart, selectedIds, onSelect }: { chart: OrgChart; selectedIds: Set<string>; onSelect: (id: string, additive: boolean) => void }) {
  const children = (parentId: string | null) => chart.nodes.filter((node) => node.parentId === parentId)
  const MemberBranch = ({ node, member, depth }: { node: OrgNode; member: Member; depth: number }) => <>
    <div className="list-member" style={{ marginLeft: depth * 18 + 30 }}>
      <span>{member.role}</span><strong>{memberNames(member.name).join(', ')}</strong>
    </div>
    {node.members.filter((candidate) => candidate.parentMemberId === member.id).map((child) => <MemberBranch key={child.id} node={node} member={child} depth={depth + 1} />)}
  </>
  const Branch = ({ node, depth = 0 }: { node: OrgNode; depth?: number }) => (
    <div className="list-branch">
      <button className={`list-node ${selectedIds.has(node.id) ? 'selected' : ''}`} data-depth={depth} style={{ marginLeft: depth * 18, '--node-accent': node.color || chart.accent } as CSSProperties} onClick={(event) => onSelect(node.id, event.ctrlKey || event.metaKey)}>
        <span className="list-dot" />
        <span><strong>{node.title}</strong><small>{node.members.length} entrée{node.members.length > 1 ? 's' : ''}</small></span>
        <ChevronDown size={16} />
      </button>
      {node.members.some((member) => member.isDepartmentHead)
        ? node.members.filter((member) => member.isDepartmentHead).map((head) => {
          const logicalNode = { ...node, members: node.members.map((member) => member.id === head.id ? member : { ...member, parentMemberId: head.id }) }
          return <MemberBranch key={head.id} node={logicalNode} member={head} depth={depth} />
        })
        : hasMemberHierarchy(node)
        ? node.members.filter((member) => !member.parentMemberId || !node.members.some((candidate) => candidate.id === member.parentMemberId)).map((member) => <MemberBranch key={member.id} node={node} member={member} depth={depth} />)
        : node.members.map((member) => <div className="list-member" style={{ marginLeft: depth * 18 + 30 }} key={member.id}><span>{member.role}</span><strong>{memberNames(member.name).join(', ')}</strong></div>)}
      {children(node.id).map((child) => <Branch key={child.id} node={child} depth={depth + 1} />)}
    </div>
  )
  return <div className="mobile-list">{children(null).map((root) => <Branch key={root.id} node={root} />)}</div>
}

export type OrgChartEditorProps = {
  initialChart?: OrgChart
  onBackToLibrary?: () => void
  onCloudSave?: (chart: OrgChart) => Promise<void>
}

export default function App({ initialChart, onBackToLibrary, onCloudSave }: OrgChartEditorProps) {
  const [chart, setChartState] = useState<OrgChart>(() => initialChart ? structuredClone(initialChart) : loadChart())
  const chartRef = useRef(chart)
  const undoStack = useRef<OrgChart[]>([])
  const redoStack = useRef<OrgChart[]>([])
  const setChart = (update: OrgChart | ((current: OrgChart) => OrgChart)) => {
    const current = chartRef.current
    const next = typeof update === 'function' ? update(current) : update
    if (next === current) return
    undoStack.current.push(structuredClone(current))
    if (undoStack.current.length > 100) undoStack.current.shift()
    redoStack.current = []
    chartRef.current = next
    setChartState(next)
  }
  const initialSelectedId = chart.nodes[0]?.id ?? ''
  const [selectedId, setSelectedId] = useState(initialSelectedId)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set(initialSelectedId ? [initialSelectedId] : []))
  const [bulkParentId, setBulkParentId] = useState('')
  const [view, setView] = useState<'chart' | 'list'>(() => window.matchMedia('(max-width: 700px)').matches ? 'list' : 'chart')
  const [zoom, setZoom] = useState(0.72)
  const [exporting, setExporting] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [exportPreview, setExportPreview] = useState<{ format: ExportFormat; src: string; width: number; height: number } | null>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const [inspectorOpen, setInspectorOpen] = useState(false)
  const [notice, setNotice] = useState('')
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [selectedMember, setSelectedMember] = useState<{ nodeId: string; memberId: string } | null>(null)
  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<string>>(() => new Set())
  const [pendingDeleteMember, setPendingDeleteMember] = useState<{ nodeId: string; memberId: string } | null>(null)
  const [pendingIncompleteAction, setPendingIncompleteAction] = useState<PendingIncompleteAction | null>(null)
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [draggedFunction, setDraggedFunction] = useState<{ nodeId: string; memberId: string } | null>(null)
  const [dropIntent, setDropIntent] = useState<{ targetId: string; mode: DropMode } | null>(null)
  const [handMode, setHandMode] = useState(false)
  const [isPanning, setIsPanning] = useState(false)
  const canvasRef = useRef<HTMLDivElement>(null)
  const logoUploadRef = useRef<HTMLInputElement>(null)
  const canvasScrollerRef = useRef<HTMLDivElement>(null)
  const zoomStageRef = useRef<HTMLDivElement>(null)
  const zoomRef = useRef(zoom)
  const handModeRef = useRef(false)
  const panStartRef = useRef<{ x: number; y: number; scrollLeft: number; scrollTop: number; moved: boolean } | null>(null)
  const suppressCanvasClickRef = useRef(false)
  const dropIntentRef = useRef<{ targetId: string; mode: DropMode } | null>(null)
  const duplicateOnDropRef = useRef(false)
  const layout = useMemo(() => layoutNodes(chart.nodes), [chart.nodes])
  const selectedBrand = getBrandLogo(chart.logoId)
  const selected = chart.nodes.find((node) => node.id === selectedId)
  const selectedNodes = chart.nodes.filter((node) => selectedIds.has(node.id))
  const selectedSiblings = selected ? chart.nodes.filter((node) => node.parentId === selected.parentId) : []
  const canReorderSelected = selectedSiblings.length > 1
  const positions = new Map(layout.nodes.map((node) => [node.id, node]))

  const bulkInvalidParentIds = useMemo(() => {
    const invalid = new Set(selectedIds)
    let changed = true
    while (changed) {
      changed = false
      chart.nodes.forEach((node) => {
        if (node.parentId && invalid.has(node.parentId) && !invalid.has(node.id)) {
          invalid.add(node.id)
          changed = true
        }
      })
    }
    return invalid
  }, [chart.nodes, selectedIds])

  const setCanvasZoom = useCallback((value: number) => {
    const next = Math.min(1.25, Math.max(.35, value))
    zoomRef.current = next
    setZoom(next)
  }, [])

  const flashHistoryNotice = useCallback((message: string) => {
    setNotice(message)
    window.setTimeout(() => setNotice(''), 1800)
  }, [])

  const undo = useCallback(() => {
    const previous = undoStack.current.pop()
    if (!previous) return
    redoStack.current.push(structuredClone(chartRef.current))
    chartRef.current = previous
    setChartState(previous)
    flashHistoryNotice('Modification annulée')
  }, [flashHistoryNotice])

  const redo = useCallback(() => {
    const next = redoStack.current.pop()
    if (!next) return
    undoStack.current.push(structuredClone(chartRef.current))
    chartRef.current = next
    setChartState(next)
    flashHistoryNotice('Modification rétablie')
  }, [flashHistoryNotice])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.ctrlKey && !event.metaKey) return
      const target = event.target as HTMLElement | null
      if (target?.matches('input, textarea, select, [contenteditable="true"]')) return
      const key = event.key.toLowerCase()
      if (key === 'z') {
        event.preventDefault()
        if (event.shiftKey) redo()
        else undo()
      } else if (key === 'y') {
        event.preventDefault()
        redo()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [redo, undo])

  useEffect(() => {
    const scroller = canvasScrollerRef.current
    const stage = zoomStageRef.current
    if (!scroller || !stage || view !== 'chart') return

    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey || !event.altKey) return
      event.preventDefault()

      const currentZoom = zoomRef.current
      const direction = event.deltaY < 0 ? 1 : -1
      const nextZoom = Math.min(1.25, Math.max(.35, currentZoom + direction * .08))
      if (nextZoom === currentZoom) return

      const stageRect = stage.getBoundingClientRect()
      const anchorX = (event.clientX - stageRect.left) / currentZoom
      const anchorY = (event.clientY - stageRect.top) / currentZoom
      setCanvasZoom(nextZoom)

      window.requestAnimationFrame(() => {
        const nextRect = stage.getBoundingClientRect()
        scroller.scrollLeft += nextRect.left + anchorX * nextZoom - event.clientX
        scroller.scrollTop += nextRect.top + anchorY * nextZoom - event.clientY
      })
    }

    scroller.addEventListener('wheel', onWheel, { passive: false })
    return () => scroller.removeEventListener('wheel', onWheel)
  }, [setCanvasZoom, view])

  useEffect(() => {
    const isEditable = (target: EventTarget | null) => target instanceof HTMLElement && Boolean(target.closest('input, textarea, select, [contenteditable="true"]'))
    const stopHandMode = () => {
      handModeRef.current = false
      panStartRef.current = null
      setHandMode(false)
      setIsPanning(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || event.repeat || view !== 'chart' || isEditable(event.target)) return
      event.preventDefault()
      handModeRef.current = true
      setHandMode(true)
    }
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') stopHandMode()
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', stopHandMode)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', stopHandMode)
      stopHandMode()
    }
  }, [view])

  const updateChart = (patch: Partial<OrgChart>) => setChart((current) => ({ ...current, ...patch }))
  const updateNodeById = (nodeId: string, patch: Partial<OrgNode>) => setChart((current) => ({
    ...current,
    nodes: current.nodes.map((node) => node.id === nodeId ? { ...node, ...patch } : node),
  }))
  const updateNode = (patch: Partial<OrgNode>) => updateNodeById(selectedId, patch)
  const showNotice = (message: string) => {
    setNotice(message)
    window.setTimeout(() => setNotice(''), 2600)
  }
  const downloadOrgChart = (source = chart) => {
    const content = JSON.stringify(makeOrgChartFile(source), null, 2)
    downloadBlob(new Blob([content], { type: 'application/json;charset=utf-8' }), `${safeFileName(source.fileName)}.orgchart`)
  }
  const saveNow = async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(chart))
    try {
      if (onCloudSave) await onCloudSave(chart)
      downloadOrgChart()
      showNotice(onCloudSave ? 'Enregistré dans le cloud · fichier .orgchart téléchargé' : 'Enregistré sur cet appareil · fichier .orgchart téléchargé')
    } catch (error) {
      showNotice(error instanceof Error ? error.message : 'Impossible d’enregistrer dans le cloud')
    }
  }
  const save = () => {
    if (countEmptyFields(chart) > 0) {
      setPendingIncompleteAction({ kind: 'save' })
      return
    }
    void saveNow()
  }
  const importOrgChart = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget
    const file = input.files?.[0]
    if (!file) return
    try {
      const parsed = JSON.parse(await file.text()) as unknown
      const wrapped = parsed && typeof parsed === 'object' && 'chart' in parsed ? parsed as Partial<OrgChartFile> : null
      if (wrapped && (wrapped.format !== ORGCHART_FORMAT || typeof wrapped.formatVersion !== 'number' || wrapped.formatVersion > ORGCHART_FORMAT_VERSION)) {
        throw new Error('Format incompatible')
      }
      const imported = normalizeChart(wrapped?.chart ?? parsed)
      if (!imported) throw new Error('Contenu invalide')
      imported.fileName = safeFileName(file.name)
      setChart(imported)
      chartRef.current = imported
      localStorage.setItem(STORAGE_KEY, JSON.stringify(imported))
      const firstId = imported.nodes[0]?.id ?? ''
      setSelectedId(firstId)
      setSelectedIds(new Set(firstId ? [firstId] : []))
      setBulkParentId('')
      setExportPreview(null)
      showNotice(`${imported.fileName}.orgchart ouvert`)
    } catch {
      showNotice('Ce fichier .orgchart est invalide ou incompatible')
    } finally {
      input.value = ''
    }
  }
  const addNode = () => {
    const node: OrgNode = { id: makeId(), title: 'Nouveau département', parentId: chart.nodes[0]?.id ?? null, members: [] }
    setChart((current) => ({ ...current, nodes: [...current.nodes, node] }))
    setSelectedId(node.id)
    setSelectedIds(new Set([node.id]))
    setInspectorOpen(true)
  }
  const addFunctionGroupOnConnector = (parentId: string, side: 'left' | 'right') => {
    const node: OrgNode = {
      id: makeId(),
      title: 'AUX',
      parentId,
      kind: 'function-group',
      connectorSide: side,
      members: [{ id: makeId(), role: '', name: '', parentMemberId: null }],
    }
    setChart((current) => ({ ...current, nodes: [...current.nodes, node] }))
    setSelectedId(node.id)
    setSelectedIds(new Set([node.id]))
    setInspectorOpen(true)
    showNotice(`Branche ajoutée à ${side === 'left' ? 'gauche' : 'droite'}`)
  }
  const convertFunctionGroupToDepartment = (nodeId: string) => {
    updateNodeById(nodeId, { kind: 'department', title: 'Nouveau département' })
    setSelectedId(nodeId)
    setSelectedIds(new Set([nodeId]))
    showNotice('AUX converti en département')
    window.requestAnimationFrame(() => {
      const label = document.querySelector<HTMLElement>(`[data-node-id="${nodeId}"] .nav-label`)
      label?.focus()
      const selection = window.getSelection()
      if (!label || !selection) return
      const range = document.createRange()
      range.selectNodeContents(label)
      selection.removeAllRanges()
      selection.addRange(range)
    })
  }
  const cloneNode = (node: OrgNode, parentId = node.parentId): OrgNode => ({
    ...node,
    id: makeId(),
    title: `${node.title} (copie)`,
    parentId,
    members: node.members.map((member) => ({ ...member, id: makeId() })),
  })
  const duplicateSelectedNode = () => {
    if (selectedIds.size !== 1 || !selected) return
    const copy = cloneNode(selected)
    setChart((current) => {
      const nodes = [...current.nodes]
      const sourceIndex = nodes.findIndex((node) => node.id === selected.id)
      nodes.splice(sourceIndex + 1, 0, copy)
      return { ...current, nodes }
    })
    setSelectedId(copy.id)
    setSelectedIds(new Set([copy.id]))
    showNotice(`${selected.title} dupliqué`)
  }
  const removeNodeBranch = (nodeId: string) => {
    const deletedIds = branchNodeIds(chart.nodes, nodeId)
    if (deletedIds.size === chart.nodes.length) {
      setPendingDeleteId(null)
      showNotice('Impossible de supprimer tous les départements')
      return
    }
    setChart((current) => ({
      ...current,
      nodes: current.nodes.filter((node) => !deletedIds.has(node.id)),
    }))
    const fallbackId = chart.nodes.find((node) => !deletedIds.has(node.id))?.id ?? ''
    setSelectedId(fallbackId)
    setSelectedIds(new Set(fallbackId ? [fallbackId] : []))
    setPendingDeleteId(null)
    showNotice(`${deletedIds.size} département${deletedIds.size > 1 ? 's' : ''} supprimé${deletedIds.size > 1 ? 's' : ''}`)
  }
  const deleteNode = () => {
    if (!selected || chart.nodes.length === 1) {
      showNotice('L’organigramme doit conserver au moins un département')
      return
    }
    if (branchNodeIds(chart.nodes, selected.id).size === 1) removeNodeBranch(selected.id)
    else setPendingDeleteId(selected.id)
  }
  const confirmDeleteNode = () => {
    if (!pendingDeleteId) return
    removeNodeBranch(pendingDeleteId)
  }
  const addMember = () => updateNode({ members: [...(selected?.members ?? []), { id: makeId(), role: 'Fonction', name: '' }] })
  const addFirstFunction = (nodeId: string) => updateNodeById(nodeId, { members: [{ id: makeId(), role: '', name: '' }] })
  const updateMemberInNode = (nodeId: string, memberId: string, patch: Partial<Member>) => setChart((current) => ({
    ...current,
    nodes: current.nodes.map((node) => node.id === nodeId ? {
      ...node,
      members: node.members.map((member) => member.id === memberId ? { ...member, ...patch } : member),
    } : node),
  }))
  const setDepartmentHead = (nodeId: string, memberId: string, enabled: boolean) => setChart((current) => ({
    ...current,
    nodes: current.nodes.map((node) => node.id !== nodeId ? node : {
      ...node,
      members: node.members.map((member) => {
        if (!enabled) return member.id === memberId ? { ...member, isDepartmentHead: false } : member
        if (member.id === memberId) return { ...member, isDepartmentHead: true, parentMemberId: undefined }
        return { ...member, isDepartmentHead: false, parentMemberId: undefined }
      }),
    }),
  }))
  const setBulkMemberParent = (nodeId: string, parentMemberId: string | null) => {
    setChart((current) => ({
      ...current,
      nodes: current.nodes.map((node) => node.id !== nodeId ? node : {
        ...node,
        members: node.members.map((member) => selectedMemberIds.has(member.id) ? { ...member, isDepartmentHead: false, parentMemberId } : member),
      }),
    }))
    setSelectedMemberIds(new Set())
  }
  const updateMember = (id: string, patch: Partial<Member>) => updateMemberInNode(selected!.id, id, patch)
  const addRelatedMember = (source: Member, kind: 'sibling' | 'child') => {
    if (!selected) return
    const member: Member = {
      id: makeId(),
      role: '',
      name: '',
      parentMemberId: kind === 'child' ? source.id : source.parentMemberId ?? null,
    }
    updateNode({ members: [...selected.members, member] })
    showNotice(kind === 'child' ? `Fonction ajoutée sous ${source.role || 'la fonction'}` : 'Fonction ajoutée au même niveau')
  }
  const removeMember = (nodeId: string, id: string) => {
    const node = chart.nodes.find((candidate) => candidate.id === nodeId)
    if (!node) return
    const deletedMemberIds = memberBranchIds(node.members, id)
    const remainingMembers = node.members.filter((member) => !deletedMemberIds.has(member.id))
    if (node.kind === 'function-group' && remainingMembers.length === 0) {
      setChart((current) => ({ ...current, nodes: current.nodes.filter((candidate) => candidate.id !== nodeId) }))
      const parentId = node.parentId ?? ''
      setSelectedId(parentId)
      setSelectedIds(new Set(parentId ? [parentId] : []))
    } else {
      updateNodeById(nodeId, { members: remainingMembers })
    }
    setSelectedMember(null)
    setPendingDeleteMember(null)
    showNotice(`${deletedMemberIds.size} fonction${deletedMemberIds.size > 1 ? 's' : ''} supprimée${deletedMemberIds.size > 1 ? 's' : ''}`)
  }

  const moveFunctionByDrop = (targetNodeId: string, beforeMemberId?: string) => {
    if (!draggedFunction) return
    const sourceNode = chart.nodes.find((node) => node.id === draggedFunction.nodeId)
    const targetNode = chart.nodes.find((node) => node.id === targetNodeId)
    const root = sourceNode?.members.find((member) => member.id === draggedFunction.memberId)
    if (!sourceNode || !targetNode || !root) return
    const movedIds = memberBranchIds(sourceNode.members, root.id)
    if (beforeMemberId && movedIds.has(beforeMemberId)) return
    const branch = sourceNode.members.filter((member) => movedIds.has(member.id)).map((member) => member.id === root.id ? { ...member, parentMemberId: beforeMemberId ? targetNode.members.find((candidate) => candidate.id === beforeMemberId)?.parentMemberId ?? null : null } : member)
    setChart((current) => ({
      ...current,
      nodes: current.nodes
        .filter((node) => !(node.id === sourceNode.id && node.kind === 'function-group' && sourceNode.members.length === branch.length && sourceNode.id !== targetNode.id))
        .map((node) => {
          let members = node.id === sourceNode.id ? node.members.filter((member) => !movedIds.has(member.id)) : node.members
          if (node.id !== targetNode.id) return { ...node, members }
          const insertion = beforeMemberId ? members.findIndex((member) => member.id === beforeMemberId) : members.length
          members = [...members]
          members.splice(insertion < 0 ? members.length : insertion, 0, ...branch)
          return { ...node, members }
        }),
    }))
    setSelectedId(targetNodeId)
    setSelectedIds(new Set([targetNodeId]))
    setSelectedMember({ nodeId: targetNodeId, memberId: root.id })
    setDraggedFunction(null)
    showNotice('Fonction déplacée')
  }

  const addCollaborator = (nodeId: string, memberId: string) => {
    const node = chart.nodes.find((item) => item.id === nodeId)
    const member = node?.members.find((item) => item.id === memberId)
    if (!member) return
    updateMemberInNode(nodeId, memberId, { name: member.name ? `${member.name}\n` : '' })
  }

  const updateCollaborator = (nodeId: string, memberId: string, index: number, value: string) => {
    const node = chart.nodes.find((item) => item.id === nodeId)
    const member = node?.members.find((item) => item.id === memberId)
    if (!member) return
    const names = editableMemberNames(member.name)
    names[index] = value
    updateMemberInNode(nodeId, memberId, { name: names.join('\n') })
  }

  const removeCollaborator = (nodeId: string, memberId: string, index: number) => {
    const node = chart.nodes.find((item) => item.id === nodeId)
    const member = node?.members.find((item) => item.id === memberId)
    if (!member) return
    const names = editableMemberNames(member.name)
    names.splice(index, 1)
    updateMemberInNode(nodeId, memberId, { name: names.join('\n') })
  }

  const moveMember = (memberId: string, direction: -1 | 1) => {
    if (!selected || selected.members.length < 2) return
    const members = [...selected.members]
    const index = members.findIndex((member) => member.id === memberId)
    if (index < 0) return
    const [moved] = members.splice(index, 1)
    const nextIndex = (index + direction + selected.members.length) % selected.members.length
    members.splice(nextIndex, 0, moved)
    updateNode({ members })
    showNotice('Ordre des fonctions mis à jour')
  }

  const dropNode = (sourceId: string, targetId: string, mode: DropMode, duplicate = false) => {
    if (sourceId === targetId) return
    const source = chart.nodes.find((node) => node.id === sourceId)
    const target = chart.nodes.find((node) => node.id === targetId)
    if (!source || !target) return
    const nextParentId = mode === 'inside' ? target.id : target.parentId

    if (!duplicate) {
      let ancestorId = nextParentId
      while (ancestorId) {
        if (ancestorId === sourceId) {
          showNotice('Ce déplacement créerait une boucle dans la hiérarchie')
          return
        }
        ancestorId = chart.nodes.find((node) => node.id === ancestorId)?.parentId ?? null
      }
    }

    const movedNode = duplicate ? cloneNode(source, nextParentId) : { ...source, parentId: nextParentId, ...(source.kind === 'department' ? { connectorSide: undefined } : {}) }
    setChart((current) => {
      const reordered = duplicate ? [...current.nodes] : current.nodes.filter((node) => node.id !== sourceId)
      const targetIndex = reordered.findIndex((node) => node.id === targetId)
      const insertAt = mode === 'before' ? targetIndex : targetIndex + 1
      reordered.splice(insertAt, 0, movedNode)
      return { ...current, nodes: reordered }
    })
    if (duplicate) {
      setSelectedId(movedNode.id)
      setSelectedIds(new Set([movedNode.id]))
    }
    showNotice(duplicate ? `${source.title} dupliqué` : mode === 'inside' ? `${source.title} est maintenant rattaché à ${target.title}` : 'Ordre des blocs mis à jour')
  }

  const moveSelected = (direction: -1 | 1) => {
    if (!selected) return
    const siblings = chart.nodes.filter((node) => node.parentId === selected.parentId)
    if (siblings.length < 2) return
    const index = siblings.findIndex((node) => node.id === selected.id)
    if (index < 0) return

    const reorderedSiblings = [...siblings]
    const [moved] = reorderedSiblings.splice(index, 1)
    const nextIndex = (index + direction + siblings.length) % siblings.length
    reorderedSiblings.splice(nextIndex, 0, moved)

    setChart((current) => {
      let siblingIndex = 0
      return {
        ...current,
        nodes: current.nodes.map((node) => node.parentId === selected.parentId ? reorderedSiblings[siblingIndex++] : node),
      }
    })
    showNotice('Ordre des blocs mis à jour')
  }

  const invalidParentIds = useMemo(() => {
    if (!selected) return new Set<string>()
    const invalid = new Set([selected.id])
    let changed = true
    while (changed) {
      changed = false
      chart.nodes.forEach((node) => {
        if (node.parentId && invalid.has(node.parentId) && !invalid.has(node.id)) {
          invalid.add(node.id)
          changed = true
        }
      })
    }
    return invalid
  }, [chart.nodes, selected])

  const onLogo = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    event.target.value = ''
    const reader = new FileReader()
    reader.onload = async () => {
      const logo = String(reader.result)
      try {
        const accent = await dominantContrastingColor(logo)
        updateChart({ logoId: 'custom', logo, accent, customLogo: logo, customAccent: accent })
        showNotice(accent === '#6B7280' ? 'Logo importé · couleur neutre appliquée pour garantir la lisibilité' : `Logo importé · couleur dominante ${accent} appliquée`)
      } catch {
        updateChart({ logoId: 'custom', logo, accent: '#6B7280', customLogo: logo, customAccent: '#6B7280' })
        showNotice('Logo importé · couleur neutre appliquée')
      }
    }
    reader.readAsDataURL(file)
  }

  const selectBrandLogo = (logoId: string) => {
    if (logoId === 'custom') {
      updateChart({
        logoId,
        locationId: undefined,
        logo: chart.customLogo ?? CUSTOM_LOGO_PLACEHOLDER,
        accent: chart.customAccent ?? '#6B7280',
        fileName: 'XXXXXXXX',
        title: 'XXXXXXXX',
      })
      return
    }
    const brand = getBrandLogo(logoId)
    if (!brand) return
    const details = entityDocumentDetails(logoId, chart.locationId)
    updateChart({
      logoId: brand.id,
      logo: brand.src,
      accent: brand.accent,
      locationId: details?.locationId,
      ...(details ? { fileName: details.fileName, title: details.title } : {}),
    })
    showNotice(`${brand.label} sélectionné · couleur de marque appliquée`)
  }

  const selectCleaningLocation = (locationId: string) => {
    const details = entityDocumentDetails('laurenty-nettoyage', locationId)
    if (!details) return
    updateChart({ locationId: details.locationId ?? locationId, fileName: details.fileName, title: details.title })
  }

  const selectNode = (id: string, additive = false, revealInspector = true) => {
    if (suppressCanvasClickRef.current) return
    const next = additive ? new Set(selectedIds) : new Set<string>()
    if (additive && next.has(id)) {
      if (next.size > 1) next.delete(id)
    } else {
      next.add(id)
    }
    const primaryId = next.has(id) ? id : [...next].at(-1) ?? id
    setSelectedIds(next)
    setBulkParentId('')
    setSelectedId(primaryId)
    setSelectedMember(null)
    if (!additive && revealInspector && window.matchMedia('(max-width: 1050px)').matches) setInspectorOpen(true)
  }
  const clearSelection = () => {
    if (suppressCanvasClickRef.current) return
    setSelectedId('')
    setSelectedIds(new Set())
    setSelectedMember(null)
    setBulkParentId('')
    setInspectorOpen(false)
  }

  useEffect(() => {
    if (!selectedMember) return
    const frame = window.requestAnimationFrame(() => {
      const editor = document.querySelector<HTMLElement>(`.person-editor[data-member-id="${selectedMember.memberId}"]`)
      editor?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      editor?.querySelector<HTMLInputElement>('input[aria-label="Fonction"]')?.focus({ preventScroll: true })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [selectedMember, inspectorOpen])

  const attachSelectedNodes = () => {
    if (selectedIds.size < 2) return
    const parentId = bulkParentId || null
    setChart((current) => ({
      ...current,
      nodes: current.nodes.map((node) => selectedIds.has(node.id) ? { ...node, parentId } : node),
    }))
    const parentName = parentId ? chart.nodes.find((node) => node.id === parentId)?.title : 'la racine'
    showNotice(`${selectedIds.size} départements rattachés à ${parentName || 'la sélection'}`)
  }

  const generateExportPreview = async (format: ExportFormat) => {
    setPreviewing(true)
    setExportOpen(false)
    try {
      const rendered = await renderExportCanvas(chart, layout, 1)
      setExportPreview({ format, src: rendered.toDataURL('image/png'), width: layout.width, height: layout.height })
    } catch {
      showNotice('Impossible de générer l’aperçu')
    } finally {
      setPreviewing(false)
    }
  }
  const openExportPreview = (format: ExportFormat) => {
    if (countEmptyFields(chart) > 0) {
      setExportOpen(false)
      setPendingIncompleteAction({ kind: 'export', format })
      return
    }
    void generateExportPreview(format)
  }

  const downloadJpg = async () => {
    setExporting(true)
    try {
      const rendered = await renderExportCanvas(chart, layout)
      const blob = await new Promise<Blob>((resolve, reject) => rendered.toBlob((value) => value ? resolve(value) : reject(new Error('JPG indisponible')), 'image/jpeg', 0.96))
      const filename = safeFileName(chart.fileName)
      downloadBlob(blob, `${filename}.jpg`)
      downloadOrgChart()
      showNotice('JPG et fichier source .orgchart générés')
      setExportPreview(null)
    } catch {
      showNotice('Impossible de générer le JPG')
    } finally {
      setExporting(false)
      setExportOpen(false)
    }
  }

  const downloadPdf = async () => {
    setExporting(true)
    try {
      const [{ jsPDF }, rendered] = await Promise.all([import('jspdf'), renderExportCanvas(chart, layout)])
      const pdf = new jsPDF({ orientation: layout.width >= layout.height ? 'landscape' : 'portrait', unit: 'mm', format: 'a3' })
      const pageWidth = pdf.internal.pageSize.getWidth()
      const pageHeight = pdf.internal.pageSize.getHeight()
      const ratio = Math.min(pageWidth / rendered.width, pageHeight / rendered.height)
      const width = rendered.width * ratio
      const height = rendered.height * ratio
      pdf.addImage(rendered.toDataURL('image/png'), 'PNG', (pageWidth - width) / 2, (pageHeight - height) / 2, width, height, undefined, 'FAST')
      const filename = safeFileName(chart.fileName)
      downloadBlob(pdf.output('blob'), `${filename}.pdf`)
      downloadOrgChart()
      showNotice('PDF et fichier source .orgchart générés')
      setExportPreview(null)
    } catch {
      showNotice('Impossible de générer le PDF')
    } finally {
      setExporting(false)
      setExportOpen(false)
    }
  }

  useEffect(() => {
    const onShortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const isEditing = Boolean(target?.closest('input, textarea, select, [contenteditable="true"]'))
      if (event.key === 'Delete' && !isEditing && selectedMember) {
        event.preventDefault()
        setPendingDeleteMember(selectedMember)
        return
      }
      if (event.key === 'Delete' && !isEditing && selectedIds.size === 1) {
        event.preventDefault()
        deleteNode()
        return
      }
      if ((!event.ctrlKey && !event.metaKey) || event.altKey) return
      const key = event.key.toLowerCase()
      if (isEditing && key === 'd') return
      if (key === 's') {
        event.preventDefault()
        save()
      } else if (key === 'e') {
        event.preventDefault()
        setExportOpen(true)
      } else if (key === 'd') {
        event.preventDefault()
        if (selectedIds.size === 1) duplicateSelectedNode()
        else showNotice('Sélectionnez un seul département pour le dupliquer')
      }
    }
    window.addEventListener('keydown', onShortcut)
    return () => window.removeEventListener('keydown', onShortcut)
  })

  useEffect(() => {
    if (!pendingDeleteId && !pendingDeleteMember) return
    const confirmWithKeyboard = (event: KeyboardEvent) => {
      if (event.key !== 'Enter') return
      event.preventDefault()
      if (pendingDeleteMember) removeMember(pendingDeleteMember.nodeId, pendingDeleteMember.memberId)
      else confirmDeleteNode()
    }
    window.addEventListener('keydown', confirmWithKeyboard)
    return () => window.removeEventListener('keydown', confirmWithKeyboard)
  }, [pendingDeleteId, pendingDeleteMember])

  const pendingDeleteNode = chart.nodes.find((node) => node.id === pendingDeleteId)
  const pendingFunctionNode = pendingDeleteMember ? chart.nodes.find((node) => node.id === pendingDeleteMember.nodeId) : undefined
  const pendingFunction = pendingFunctionNode?.members.find((member) => member.id === pendingDeleteMember?.memberId)
  const pendingFunctionBranchSize = pendingFunctionNode && pendingFunction ? memberBranchIds(pendingFunctionNode.members, pendingFunction.id).size : 0
  const emptyFieldCount = countEmptyFields(chart)
  const pendingDeleteDescendants = pendingDeleteId ? (() => {
    const ids = new Set([pendingDeleteId])
    let changed = true
    while (changed) {
      changed = false
      chart.nodes.forEach((node) => {
        if (node.parentId && ids.has(node.parentId) && !ids.has(node.id)) {
          ids.add(node.id)
          changed = true
        }
      })
    }
    return ids.size - 1
  })() : 0

  const structureChildren = (parentId: string | null) => chart.nodes.filter((node) => node.parentId === parentId)
  const renderStructureBranch = (node: OrgNode, depth = 0, ancestry = new Set<string>()): React.ReactNode => {
    if (ancestry.has(node.id)) return null
    const nextAncestry = new Set(ancestry).add(node.id)
    const children = structureChildren(node.id)
    return <div className="structure-branch" data-branch-depth={depth} key={node.id}>
      <button
        data-node-id={node.id}
        data-depth={depth}
        data-draggable={selectedIds.size === 1 && selectedIds.has(node.id)}
        className={`${selectedIds.has(node.id) ? 'active' : ''} ${dropIntent?.targetId === node.id ? `drop-${dropIntent.mode}` : ''} ${draggedId === node.id ? 'dragging' : ''}`}
        style={{ '--node-accent': node.color || chart.accent } as CSSProperties}
        onClick={(event) => selectNode(node.id, event.ctrlKey || event.metaKey)}
        onDragOver={(event) => { if (draggedFunction) event.preventDefault() }}
        onDrop={(event) => { if (!draggedFunction) return; event.preventDefault(); event.stopPropagation(); moveFunctionByDrop(node.id) }}
        onPointerDown={(event) => {
          if (event.button !== 0 || selectedIds.size !== 1 || !selectedIds.has(node.id)) return
          event.currentTarget.setPointerCapture(event.pointerId)
          duplicateOnDropRef.current = event.altKey
          setDraggedId(node.id)
        }}
        onPointerMove={(event) => {
          if (event.buttons !== 1 || draggedId !== node.id) return
          const targetElement = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-node-id]')
          const targetId = targetElement?.dataset.nodeId
          const targetNode = chart.nodes.find((candidate) => candidate.id === targetId)
          if (!targetElement || !targetId || targetId === node.id || targetNode?.kind === 'function-group' || targetNode?.connectorSide) {
            dropIntentRef.current = null
            setDropIntent(null)
            return
          }
          const rect = targetElement.getBoundingClientRect()
          const ratio = (event.clientY - rect.top) / rect.height
          const mode: DropMode = ratio < .25 ? 'before' : ratio > .75 ? 'after' : 'inside'
          const intent = { targetId, mode }
          dropIntentRef.current = intent
          setDropIntent(intent)
        }}
        onPointerUp={() => {
          if (draggedId !== node.id) return
          const intent = dropIntentRef.current
          if (intent) dropNode(node.id, intent.targetId, intent.mode, duplicateOnDropRef.current)
          setDraggedId(null)
          duplicateOnDropRef.current = false
          dropIntentRef.current = null
          setDropIntent(null)
        }}
        onPointerCancel={() => {
          setDraggedId(null)
          duplicateOnDropRef.current = false
          dropIntentRef.current = null
          setDropIntent(null)
        }}
        title={`Rattaché à ${node.parentId ? chart.nodes.find((candidate) => candidate.id === node.parentId)?.title ?? 'un département' : 'la racine'}`}
      >
        <GripVertical className="drag-handle" size={14} />
        <span className="hierarchy-branch" aria-hidden="true" />
        <span className="nav-dot" />
        <span
          className="nav-label"
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-label={`Renommer ${node.title}`}
          spellCheck={false}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => { event.stopPropagation(); selectNode(node.id, event.ctrlKey || event.metaKey) }}
          onBlur={(event) => {
            const title = event.currentTarget.textContent?.trim()
            if (title && title !== node.title) updateNodeById(node.id, { title })
            else if (!title) event.currentTarget.textContent = node.title
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              event.currentTarget.blur()
            }
          }}
        >{node.title}</span>
        <small>{node.members.length}</small>
        {node.kind === 'function-group' && <span
          className="convert-department"
          role="button"
          tabIndex={0}
          title="Convertir AUX en département"
          aria-label="Convertir AUX en département"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => { event.stopPropagation(); convertFunctionGroupToDepartment(node.id) }}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return
            event.preventDefault()
            event.stopPropagation()
            convertFunctionGroupToDepartment(node.id)
          }}
        ><Building2 size={13} /></span>}
      </button>
      {node.members.length > 0 && <div className="structure-functions">
        {node.members.map((member) => {
          let functionDepth = 0
          let parentId = member.parentMemberId
          const visited = new Set<string>()
          while (parentId && !visited.has(parentId)) {
            visited.add(parentId)
            const parent = node.members.find((candidate) => candidate.id === parentId)
            if (!parent) break
            functionDepth += 1
            parentId = parent.parentMemberId
          }
          const active = selectedMember?.nodeId === node.id && selectedMember.memberId === member.id
          return <div
            className={`function-nav-row ${active ? 'active' : ''} ${draggedFunction?.memberId === member.id ? 'dragging' : ''}`}
            style={{ marginLeft: functionDepth * 14 }}
            draggable
            key={member.id}
            onDragStart={(event) => { event.stopPropagation(); setDraggedFunction({ nodeId: node.id, memberId: member.id }); event.dataTransfer.effectAllowed = 'move' }}
            onDragEnd={() => setDraggedFunction(null)}
            onDragOver={(event) => { if (draggedFunction) { event.preventDefault(); event.dataTransfer.dropEffect = 'move' } }}
            onDrop={(event) => { event.preventDefault(); event.stopPropagation(); moveFunctionByDrop(node.id, member.id) }}
            onClick={(event) => {
              event.stopPropagation()
              selectNode(node.id, false, false)
              setSelectedMember({ nodeId: node.id, memberId: member.id })
              setInspectorOpen(true)
            }}
            title="Glisser pour déplacer cette fonction"
          >
            <GripVertical size={11} />
            <span>{member.role || 'Nom de la fonction'}</span>
          </div>
        })}
      </div>}
      {children.length > 0 && <div className="structure-children">{children.map((child) => renderStructureBranch(child, depth + 1, nextAncestry))}</div>}
    </div>
  }

  return (
    <div className="app-shell" spellCheck={false}>
      <header className="topbar">
        <div className="brand-mark"><LayoutDashboard size={22} /></div>
        <div className="brand-copy"><strong>Organigrammes</strong><span>Laurenty Studio</span></div>
        <label className="document-name" title="Nom du fichier source">
          <FileJson size={17} />
          <input aria-label="Nom du document" spellCheck={false} value={chart.fileName} onChange={(event) => updateChart({ fileName: event.target.value })} />
          <span>.orgchart</span>
        </label>
        <div className="topbar-actions">
          {onBackToLibrary && <button className="button ghost" onClick={onBackToLibrary}><LayoutDashboard size={17} /><span>Mes organigrammes</span></button>}
          <div className="history-actions">
            <button aria-label="Annuler" title="Annuler (Ctrl+Z)" onClick={undo}><Undo2 size={17} /></button>
            <button aria-label="Rétablir" title="Rétablir (Ctrl+Maj+Z)" onClick={redo}><Redo2 size={17} /></button>
          </div>
          <label className="button ghost file-open" title="Ouvrir un fichier .orgchart">
            <Upload size={17} /><span>Ouvrir</span>
            <input type="file" accept=".orgchart,application/json" onChange={importOrgChart} />
          </label>
          <button className="button ghost" aria-label="Enregistrer" title="Enregistrer (Ctrl+S)" onClick={save}><Save size={17} /> <span>Enregistrer</span></button>
          <div className="export-menu">
            <button className="button primary" title="Exporter (Ctrl+E)" disabled={exporting || previewing} aria-expanded={exportOpen} onClick={() => setExportOpen((open) => !open)}><Download size={17} /> {previewing ? 'Aperçu…' : exporting ? 'Export…' : 'Exporter'}</button>
            {exportOpen && <div className="export-popover open">
              <button onClick={() => openExportPreview('pdf')}><FileText size={17} />Aperçu PDF A3</button>
              <button onClick={() => openExportPreview('jpg')}><FileImage size={17} />Aperçu JPG</button>
            </div>}
          </div>
        </div>
      </header>

      {notice && <div className="toast" role="status">{notice}</div>}

      {pendingIncompleteAction && <div className="confirm-backdrop" onClick={() => setPendingIncompleteAction(null)}>
        <section className="confirm-dialog warning-dialog" role="alertdialog" aria-modal="true" aria-labelledby="empty-title" aria-describedby="empty-description" onClick={(event) => event.stopPropagation()}>
          <div className="confirm-icon warning"><AlertTriangle size={23} /></div>
          <div>
            <span className="confirm-eyebrow warning">Document incomplet</span>
            <h2 id="empty-title">Attention, certaines cases sont vides</h2>
            <p id="empty-description">{emptyFieldCount} champ{emptyFieldCount > 1 ? 's semblent' : ' semble'} encore vide{emptyFieldCount > 1 ? 's' : ''}. Vous pouvez revenir dans l’organigramme pour {emptyFieldCount > 1 ? 'les' : 'le'} compléter.</p>
          </div>
          <footer>
            <button className="button" onClick={() => setPendingIncompleteAction(null)}>Annuler</button>
            <button className="button primary" onClick={() => {
              const action = pendingIncompleteAction
              setPendingIncompleteAction(null)
              if (action.kind === 'save') void saveNow()
              else void generateExportPreview(action.format)
            }}>{pendingIncompleteAction.kind === 'save' ? 'Enregistrer quand même' : 'Exporter quand même'}</button>
          </footer>
        </section>
      </div>}

      {pendingDeleteNode && <div className="confirm-backdrop" onClick={() => setPendingDeleteId(null)}>
        <section className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-title" aria-describedby="delete-description" onClick={(event) => event.stopPropagation()}>
          <div className="confirm-icon"><Trash2 size={22} /></div>
          <div>
            <span className="confirm-eyebrow">Suppression définitive</span>
            <h2 id="delete-title">Supprimer « {pendingDeleteNode.title} » ?</h2>
            <p id="delete-description">{pendingDeleteDescendants > 0
              ? <>Attention, ce département contient <strong>{pendingDeleteDescendants} sous-département{pendingDeleteDescendants > 1 ? 's' : ''}</strong>. Toute la branche et les collaborateurs associés seront également supprimés.</>
              : <>Ce département et tous les collaborateurs qu’il contient seront supprimés.</>}</p>
          </div>
          <footer>
            <button className="button" onClick={() => setPendingDeleteId(null)}>Annuler</button>
            <button className="button danger" onClick={confirmDeleteNode}><Trash2 size={16} />Supprimer définitivement</button>
          </footer>
        </section>
      </div>}

      {pendingFunctionNode && pendingFunction && <div className="confirm-backdrop" onClick={() => setPendingDeleteMember(null)}>
        <section className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-function-title" aria-describedby="delete-function-description" onClick={(event) => event.stopPropagation()}>
          <div className="confirm-icon"><Trash2 size={22} /></div>
          <div>
            <span className="confirm-eyebrow">Suppression définitive</span>
            <h2 id="delete-function-title">Supprimer la fonction « {pendingFunction.role || 'Sans nom'} » ?</h2>
            <p id="delete-function-description">La fonction, ses collaborateurs{pendingFunctionBranchSize > 1 ? <> et ses <strong>{pendingFunctionBranchSize - 1} fonction{pendingFunctionBranchSize > 2 ? 's' : ''} fille{pendingFunctionBranchSize > 2 ? 's' : ''}</strong></> : null} seront supprimés. Cette action est irréversible.</p>
          </div>
          <footer>
            <button className="button" onClick={() => setPendingDeleteMember(null)}>Annuler</button>
            <button className="button danger" onClick={() => removeMember(pendingFunctionNode.id, pendingFunction.id)}><Trash2 size={16} />Supprimer la fonction</button>
          </footer>
        </section>
      </div>}

      {exportPreview && <div className="export-preview-backdrop" onClick={() => setExportPreview(null)}>
        <section className="export-preview-dialog" role="dialog" aria-modal="true" aria-label={`Aperçu ${exportPreview.format.toUpperCase()}`} onClick={(event) => event.stopPropagation()}>
          <header>
            <div><span>Aperçu avant export</span><strong>{exportPreview.format.toUpperCase()} · {exportPreview.width} × {exportPreview.height}px</strong></div>
            <button aria-label="Fermer l’aperçu" onClick={() => setExportPreview(null)}><X size={18} /></button>
          </header>
          <div className="export-preview-sheet"><img src={exportPreview.src} alt={`Aperçu de l’organigramme en ${exportPreview.format.toUpperCase()}`} /></div>
          <footer>
            <button className="button" onClick={() => setExportPreview(null)}>Annuler</button>
            <button className="button primary" disabled={exporting} onClick={exportPreview.format === 'pdf' ? downloadPdf : downloadJpg}><Download size={16} />{exporting ? 'Préparation…' : `Télécharger le ${exportPreview.format.toUpperCase()}`}</button>
          </footer>
        </section>
      </div>}

      <aside className="sidebar">
        <div className="panel-heading"><div><span>Structure</span><strong>{chart.nodes.length} blocs</strong></div><button className="icon-button" onClick={addNode} title="Ajouter un bloc"><Plus size={18} /></button></div>
        <p className="structure-hint">Ctrl+clic pour sélectionner · Alt+glisser pour dupliquer · Déposez au centre d’un bloc pour l’y rattacher</p>
        <nav className="node-nav">
          {structureChildren(null).map((node) => renderStructureBranch(node))}
        </nav>
        <button className="add-block" onClick={addNode}><Plus size={17} /> Ajouter un département</button>
      </aside>

      <main className="workspace">
        <div className="workspace-toolbar">
          <div className="segmented">
            <button className={view === 'chart' ? 'active' : ''} onClick={() => setView('chart')}><Building2 size={16} /> Organigramme</button>
            <button className={view === 'list' ? 'active' : ''} onClick={() => setView('list')}><ListTree size={16} /> Liste</button>
          </div>
          <div className="compact-actions">
            <button onClick={addNode}><Plus size={16} /> Nouveau bloc</button>
            <button className="edit-action" onClick={() => setInspectorOpen(true)}><Pencil size={16} /> Modifier</button>
          </div>
          {view === 'chart' && <div className="workspace-tools">
            {handMode && <div className={`hand-tool ${isPanning ? 'active' : ''}`} role="status"><Hand size={15} /> Main</div>}
            <div className="zoom-controls"><button onClick={() => setCanvasZoom(zoom - .1)} aria-label="Dézoomer"><Minus size={16} /></button><span>{Math.round(zoom * 100)}%</span><button onClick={() => setCanvasZoom(zoom + .1)} aria-label="Zoomer"><Plus size={16} /></button></div>
          </div>}
        </div>
        {view === 'chart' ? (
          <div
            className={`canvas-scroller ${handMode ? 'hand-mode' : ''} ${isPanning ? 'panning' : ''}`}
            ref={canvasScrollerRef}
            title="Espace pour déplacer · Ctrl+Alt+molette pour zoomer"
            onPointerDown={(event) => {
              if (!handModeRef.current || event.button !== 0) return
              event.preventDefault()
              event.currentTarget.setPointerCapture(event.pointerId)
              panStartRef.current = { x: event.clientX, y: event.clientY, scrollLeft: event.currentTarget.scrollLeft, scrollTop: event.currentTarget.scrollTop, moved: false }
              setIsPanning(true)
            }}
            onPointerMove={(event) => {
              const start = panStartRef.current
              if (!start) return
              const deltaX = event.clientX - start.x
              const deltaY = event.clientY - start.y
              if (Math.abs(deltaX) + Math.abs(deltaY) > 3) {
                start.moved = true
                suppressCanvasClickRef.current = true
              }
              event.currentTarget.scrollLeft = start.scrollLeft - deltaX
              event.currentTarget.scrollTop = start.scrollTop - deltaY
            }}
            onPointerUp={(event) => {
              const moved = panStartRef.current?.moved
              panStartRef.current = null
              setIsPanning(false)
              if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
              if (moved) window.setTimeout(() => { suppressCanvasClickRef.current = false }, 0)
            }}
            onPointerCancel={() => {
              panStartRef.current = null
              suppressCanvasClickRef.current = false
              setIsPanning(false)
            }}
          >
            <div className="zoom-stage" ref={zoomStageRef} style={{ width: layout.width * zoom, height: layout.height * zoom }}>
              <div className={`org-canvas ${selectedIds.size > 0 ? 'has-selection' : ''}`} ref={canvasRef} style={{ width: layout.width, height: layout.height, transform: `scale(${zoom})` }} onClick={clearSelection}>
                <div className="document-brand">
                  {chart.logo ? chart.logoId === 'custom'
                    ? <button className="custom-logo-trigger canvas-logo-trigger" onClick={(event) => { event.stopPropagation(); logoUploadRef.current?.click() }} aria-label="Importer un logo personnalisé" title="Cliquer pour importer un logo"><img src={chart.logo} alt="Logo personnalisé" /></button>
                    : <img src={chart.logo} alt="Logo" />
                  : <div className="logo-placeholder"><span>LAURENTY</span><small>NETTOYAGE · SCHOONMAAK</small></div>}
                  <div><strong>{chart.title}</strong><span>{chart.subtitle}</span></div>
                </div>
                <svg className="connectors" width={layout.width} height={layout.height} aria-hidden="true">
                  {layout.nodes.filter((node) => !node.connectorSide && node.parentId && positions.has(node.parentId)).map((node) => {
                    const parent = positions.get(node.parentId!)!
                    return <path key={node.id} d={departmentConnectorPath(layout.nodes, parent, node)} />
                  })}
                  {consolidatedFunctionGroupPaths(layout.nodes).map(({ parentId, d }) => <path key={`aux-${parentId}`} d={d} />)}
                </svg>
                {layout.nodes.filter((parent) => parent.kind !== 'function-group' && layout.nodes.some((child) => child.parentId === parent.id && !child.connectorSide)).map((parent) => {
                  const children = layout.nodes.filter((child) => child.parentId === parent.id && !child.connectorSide)
                  const stemEnd = Math.min(...children.map((child) => connectorLane(layout.nodes, parent, child.depth)))
                  const top = parent.y + parent.height + 4
                  const height = Math.max(28, stemEnd - top - 4)
                  return <div key={`control-${parent.id}`} className="connector-node-control" style={{ left: parent.x + parent.width / 2, top, height }} onClick={(event) => event.stopPropagation()}>
                    <div className="connector-node-actions">
                      <button onClick={() => addFunctionGroupOnConnector(parent.id, 'left')} title="Ajouter une branche de fonctions à gauche" aria-label="Ajouter une branche de fonctions à gauche"><ChevronLeft size={13} /><Plus size={12} /></button>
                      <button onClick={() => addFunctionGroupOnConnector(parent.id, 'right')} title="Ajouter une branche de fonctions à droite" aria-label="Ajouter une branche de fonctions à droite"><Plus size={12} /><ChevronRight size={13} /></button>
                    </div>
                  </div>
                })}
                {layout.nodes.map((node) => <NodeCard
                  key={node.id}
                  node={node}
                  accent={chart.accent}
                  selected={selectedIds.has(node.id)}
                  dimmed={selectedIds.size > 0 && !selectedIds.has(node.id)}
                  onSelect={(additive, revealInspector) => selectNode(node.id, additive, revealInspector)}
                  onUpdateNode={(patch) => updateNodeById(node.id, patch)}
                  onUpdateMember={(memberId, patch) => updateMemberInNode(node.id, memberId, patch)}
                  onAddFirstFunction={() => addFirstFunction(node.id)}
                  onAddCollaborator={(memberId) => addCollaborator(node.id, memberId)}
                  onUpdateCollaborator={(memberId, index, value) => updateCollaborator(node.id, memberId, index, value)}
                  onRemoveCollaborator={(memberId, index) => removeCollaborator(node.id, memberId, index)}
                  selectedMemberId={selectedMember?.nodeId === node.id ? selectedMember.memberId : null}
                  onSelectMember={(memberId) => {
                    selectNode(node.id, false, false)
                    setSelectedMember({ nodeId: node.id, memberId })
                    setInspectorOpen(true)
                  }}
                  onRequestDeleteMember={(memberId) => setPendingDeleteMember({ nodeId: node.id, memberId })}
                  anchoredMemberIds={chart.nodes
                    .filter((child) => child.parentId === node.id)
                    .map((child) => operatorsAnchorMember(node, child)?.id)
                    .filter((memberId): memberId is string => Boolean(memberId))}
                />)}
                <span className="version">{chart.version}</span>
              </div>
            </div>
          </div>
        ) : <ListView chart={chart} selectedIds={selectedIds} onSelect={(id, additive) => selectNode(id, additive)} />}
      </main>

      {inspectorOpen && <button className="inspector-backdrop" aria-label="Fermer les propriétés" onClick={() => setInspectorOpen(false)} />}
      <aside className={`inspector ${inspectorOpen ? 'open' : ''}`}>
        <div className="panel-heading"><div><span>Propriétés</span><strong>{selectedIds.size > 1 ? `${selectedIds.size} blocs sélectionnés` : selected?.title ?? 'Aucun bloc'}</strong></div><button className="close-inspector" aria-label="Fermer" onClick={() => setInspectorOpen(false)}><X size={18} /></button></div>
        <section className="form-section">
          <div className="field-control"><span>Choix de l’entité</span><Dropdown label="Choix de l’entité" value={chart.logoId ?? 'custom'} onChange={selectBrandLogo} options={[
            ...brandLogos.map((logo) => ({ value: logo.id, label: logo.label, group: logo.family })),
            { value: 'custom', label: 'Logo personnalisé', group: 'Personnalisation' },
          ]} /></div>
          {chart.logoId === 'laurenty-nettoyage' && <div className="field-control"><span>Implantation</span><Dropdown label="Implantation" value={chart.locationId ?? 'liege'} onChange={selectCleaningLocation} options={CLEANING_LOCATIONS.map((location) => ({ value: location.value, label: location.label }))} /></div>}
          <label>Nom de fichier<input spellCheck={false} autoCorrect="off" value={chart.fileName} onChange={(e) => updateChart({ fileName: e.target.value })} /></label>
          <label>Titre du document<input spellCheck={false} autoCorrect="off" value={chart.title} onChange={(e) => updateChart({ title: e.target.value })} /></label>
          <div className="brand-choice-preview">
            {chart.logo && (chart.logoId === 'custom'
              ? <button className="custom-logo-trigger" onClick={() => logoUploadRef.current?.click()} aria-label="Importer un logo personnalisé" title="Cliquer pour importer un logo"><img src={chart.logo} alt="Logo personnalisé" /></button>
              : <img src={chart.logo} alt={selectedBrand?.label ?? 'Logo'} />)}
            <span>{selectedBrand ? `Couleur de marque ${selectedBrand.accent}` : 'Logo personnalisé'}</span>
          </div>
          <div className="form-row">
            <label>{selectedBrand ? 'Couleur imposée' : 'Couleur'}<input type="color" value={chart.accent} disabled={Boolean(selectedBrand)} onChange={(e) => updateChart({ accent: e.target.value })} /></label>
            <label className={`upload-label ${selectedBrand ? 'disabled' : ''}`}>Personnaliser<input ref={logoUploadRef} type="file" accept="image/*" disabled={Boolean(selectedBrand)} onChange={onLogo} /><span><Upload size={15} /> Importer</span></label>
          </div>
        </section>
        {selectedIds.size > 1 && <section className="form-section bulk-section">
          <div className="section-title"><span>{selectedIds.size} départements sélectionnés</span></div>
          <div className="selected-chips">{selectedNodes.map((node) => <span key={node.id}>{node.title}</span>)}</div>
          <div className="field-control"><span>Rattacher la sélection à</span><Dropdown label="Rattacher la sélection à" value={bulkParentId} onChange={setBulkParentId} options={[
            { value: '', label: 'Racine de l’organigramme' },
            ...chart.nodes.filter((node) => node.kind !== 'function-group' && !node.connectorSide && !bulkInvalidParentIds.has(node.id)).map((node) => ({ value: node.id, label: node.title })),
          ]} /></div>
          <button className="button primary bulk-attach" onClick={attachSelectedNodes}>Rattacher {selectedIds.size} départements</button>
          <p className="editor-hint">Ctrl+clic permet d’ajouter ou retirer un bloc de cette sélection.</p>
        </section>}
        {selected && selectedIds.size === 1 && <>
          <section className="form-section">
            <div className="section-title"><span>Bloc sélectionné</span><button className="danger-icon" onClick={deleteNode} title="Supprimer"><Trash2 size={16} /></button></div>
            {selected.kind !== 'function-group' && <label>Nom<input spellCheck={false} autoCorrect="off" value={selected.title} onChange={(e) => updateNode({ title: e.target.value })} /></label>}
            <div className="field-control"><span>Rattaché à</span><Dropdown label="Rattaché à" value={selected.parentId ?? ''} onChange={(value) => updateNode({ parentId: value || null })} options={[
              { value: '', label: 'Racine' },
              ...chart.nodes.filter((node) => node.kind !== 'function-group' && !node.connectorSide && !invalidParentIds.has(node.id)).map((node) => ({ value: node.id, label: node.title })),
            ]} /></div>
            <div className={`order-controls ${canReorderSelected ? '' : 'disabled'}`}><span>Ordre à ce niveau</span><div><button disabled={!canReorderSelected} onClick={() => moveSelected(-1)} aria-label="Déplacer vers la gauche"><ChevronLeft size={16} /></button><button disabled={!canReorderSelected} onClick={() => moveSelected(1)} aria-label="Déplacer vers la droite"><ChevronRight size={16} /></button></div></div>
          </section>
          <section className="form-section people-section">
            <div className="section-title"><span><Users size={15} /> Fonctions</span></div>
            <p className="editor-hint">Une fonction peut regrouper plusieurs collaborateurs : saisissez un nom par ligne.</p>
            {selectedMemberIds.size > 0 && <div className="bulk-function-parent">
              <strong>{selectedMemberIds.size} fonction{selectedMemberIds.size > 1 ? 's' : ''} sélectionnée{selectedMemberIds.size > 1 ? 's' : ''}</strong>
              <Dropdown label="Rattacher les fonctions sélectionnées" value="" onChange={(value) => setBulkMemberParent(selected.id, value || null)} options={[
                { value: '', label: 'Choisir une fonction parente…' },
                ...selected.members.filter((candidate) => !selectedMemberIds.has(candidate.id)).map((candidate) => ({ value: candidate.id, label: `Sous ${candidate.role || 'Fonction sans nom'}` })),
              ]} />
            </div>}
            {selected.members.map((member) => {
              const invalidParents = memberBranchIds(selected.members, member.id)
              const parentValue = member.parentMemberId === undefined ? '__list__' : member.parentMemberId ?? ''
              return <div className={`person-editor ${selectedMember?.nodeId === selected.id && selectedMember.memberId === member.id ? 'selected-member-editor' : ''}`} data-member-id={member.id} key={member.id}>
              <div className="person-editor-actions">
                <button disabled={selected.members.length < 2} onClick={() => moveMember(member.id, -1)} aria-label={`Monter la fonction ${member.role}`} title="Déplacer vers le haut"><ChevronUp size={13} /></button>
                <button disabled={selected.members.length < 2} onClick={() => moveMember(member.id, 1)} aria-label={`Descendre la fonction ${member.role}`} title="Déplacer vers le bas"><ChevronDown size={13} /></button>
                <button className="remove-function" onClick={() => setPendingDeleteMember({ nodeId: selected.id, memberId: member.id })} aria-label={`Supprimer la fonction ${member.role}`} title="Supprimer la fonction"><X size={13} /></button>
              </div>
              <input spellCheck={false} autoCorrect="off" aria-label="Fonction" value={member.role} onChange={(e) => updateMember(member.id, { role: e.target.value })} />
              <textarea spellCheck={false} autoCorrect="off" aria-label="Noms, un par ligne" rows={Math.min(5, Math.max(2, memberNames(member.name).length))} value={member.name} onChange={(e) => updateMember(member.id, { name: e.target.value })} onBlur={(e) => updateMember(member.id, { name: formatCollaboratorList(e.target.value) })} placeholder="Un collaborateur par ligne" />
              <label className="bulk-function-toggle"><input type="checkbox" checked={selectedMemberIds.has(member.id)} onChange={(event) => setSelectedMemberIds((current) => { const next = new Set(current); if (event.target.checked) next.add(member.id); else next.delete(member.id); return next })} /> Sélectionner pour une action groupée</label>
              {selected.kind !== 'function-group' && <label className="department-head-toggle"><input type="checkbox" checked={Boolean(member.isDepartmentHead)} onChange={(event) => setDepartmentHead(selected.id, member.id, event.target.checked)} /> Responsable du département</label>}
              <div className="function-parent-control">
                <span>Position hiérarchique</span>
                <Dropdown label={`Position de ${member.role || 'la fonction'}`} value={parentValue} onChange={(value) => updateMember(member.id, { parentMemberId: value === '__list__' ? undefined : value || null })} options={[
                  { value: '__list__', label: 'Liste simple (sans liaison)' },
                  { value: '', label: 'Premier niveau du département' },
                  ...selected.members.filter((candidate) => !invalidParents.has(candidate.id)).map((candidate) => ({ value: candidate.id, label: `Sous ${candidate.role || 'Fonction sans nom'}` })),
                ]} />
              </div>
              <div className="function-add-actions">
                <button onClick={() => addRelatedMember(member, 'sibling')}><Plus size={13} />Même niveau</button>
                <button onClick={() => addRelatedMember(member, 'child')}><Plus size={13} />Fonction fille</button>
              </div>
            </div>})}
            {selected.members.length === 0 && <button className="empty-people" onClick={addMember}>Ajouter une première fonction</button>}
            {selected.members.length > 0 && <button className="add-person" onClick={addMember}><Plus size={15} /> Ajouter une fonction</button>}
          </section>
        </>}
        <button className="reset-button" onClick={() => { setChart(sampleChart); setSelectedId(sampleChart.nodes[0].id); setSelectedIds(new Set([sampleChart.nodes[0].id])) }}><RotateCcw size={15} /> Restaurer la démo</button>
      </aside>
    </div>
  )
}
