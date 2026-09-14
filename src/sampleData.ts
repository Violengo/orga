import type { OrgChart } from './types'

export const sampleChart: OrgChart = {
  id: 'laurenty-liege-2026',
  fileName: 'LTY-SA_Liege_2026',
  title: 'Laurenty Nettoyage SA - Liège',
  subtitle: 'Organisation générale',
  version: 'V. 03/2026',
  accent: '#EB5D0B',
  logoId: 'laurenty-nettoyage',
  locationId: 'liege',
  logo: '/logos/laurenty-nettoyage.svg',
  nodes: [
    {
      id: 'staff',
      title: 'Staff',
      parentId: null,
      members: [
        { id: 'm1', role: 'Branch Director', name: 'Daniel Claes' },
        { id: 'm2', role: 'Executive Officer', name: 'Anne Demonceau' },
      ],
    },
    {
      id: 'sales',
      title: 'Sales Department',
      parentId: 'staff',
      members: [
        { id: 'm3', role: 'Business Development Consultant', name: 'Marie-Anne Vandenbrouck' },
        { id: 'm4', role: 'Sales Support Officer', name: 'Anne Demonceau' },
      ],
    },
    {
      id: 'operations',
      title: 'Operations Department',
      parentId: 'staff',
      members: [
        { id: 'm5', role: 'Deputy Head of Operations', name: 'Nathan Stevens' },
        { id: 'm6', role: 'Account Manager & Deputy Contract Manager', name: 'Michael Picard\nFlorence Gilles\nAlexandre Lambert\nMathieu London' },
        { id: 'm7', role: 'Planning Coordinator', name: 'N/A' },
        { id: 'm8', role: 'Area Supervisor / Account Supervisor', name: 'Elodie Delvaux\nMirella Zigliaini\nMarciette Oyam\nLalia Iken\nValérie Dister\nNadine Lesoinne' },
        { id: 'm8b', role: 'Operations Support Officer', name: 'Sandra Guillomont\nJessica Theunissen' },
        { id: 'm8c', role: 'Customer Support Officer', name: 'Jessica Theunissen\nNathalie Constant' },
      ],
    },
    {
      id: 'hr',
      title: 'HR Department',
      parentId: 'staff',
      members: [
        { id: 'm9', role: 'Payroll & Legal Officer', name: '' },
        { id: 'm10', role: 'Payroll Officer', name: 'Rebecca Diambongia' },
      ],
    },
    {
      id: 'invoicing',
      title: 'Invoicing Department',
      parentId: 'hr',
      members: [{ id: 'm11', role: 'Invoicing Officer', name: 'Rebecca Diambongia' }],
    },
    {
      id: 'operators',
      title: 'Operators',
      parentId: 'operations',
      members: [
        { id: 'm12', role: 'Team Leader', name: 'Jessie Thys' },
        { id: 'm13', role: 'Team Supervisor', name: '39 collaborateurs' },
        { id: 'm14', role: 'Operator', name: '842 collaborateurs' },
      ],
    },
  ],
}
