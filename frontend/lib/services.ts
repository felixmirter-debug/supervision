import { Eye, Users, HardHat, Car, CheckCircle } from 'lucide-react'

export const SERVICES = [
  {
    slug: 'zone-counting',
    apiSlug: 'zone_counting',
    label: 'Zone Counting',
    description: 'Count people or objects entering and exiting defined polygon zones.',
    icon: Eye,
    creditsPerSec: 0.5,
    color: 'text-brand',
  },
  {
    slug: 'tracking',
    apiSlug: 'tracking',
    label: 'Multi-Object Tracking',
    description: 'Track objects across video frames with persistent unique IDs.',
    icon: Users,
    creditsPerSec: 0.8,
    color: 'text-brand',
  },
  {
    slug: 'ppe-detection',
    apiSlug: 'ppe_detection',
    label: 'PPE Detection',
    description: 'Detect safety equipment compliance: helmets, vests, gloves.',
    icon: HardHat,
    creditsPerSec: 1.0,
    color: 'text-brand',
  },
  {
    slug: 'traffic',
    apiSlug: 'traffic',
    label: 'Traffic Analysis',
    description: 'Count vehicles by type and estimate speed on roads.',
    icon: Car,
    creditsPerSec: 0.8,
    color: 'text-brand',
  },
  {
    slug: 'quality-control',
    apiSlug: 'quality_control',
    label: 'Quality Control',
    description: 'Detect defects and anomalies in products on production lines.',
    icon: CheckCircle,
    creditsPerSec: 1.0,
    color: 'text-brand',
  },
] as const

export type ServiceConfig = (typeof SERVICES)[number]

export function getService(slug: string): ServiceConfig | undefined {
  return SERVICES.find((s) => s.slug === slug || s.apiSlug === slug)
}
