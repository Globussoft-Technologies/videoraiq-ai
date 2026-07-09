import { Zap, Shield, Star } from 'lucide-react'

// Static subscription plans shown on the Subscription Plans screen.
// `clients` is a placeholder count until a plans API is wired in.
// `popular` highlights the featured plan; `price`/`priceCustom` control the header.
export const PLANS = [
  {
    key: 'starter',
    name: 'Starter',
    tagline: 'Small sites & single locations',
    Icon: Zap,
    tint: 'bg-teal-50 text-teal-500 dark:bg-teal-500/10 dark:text-teal-300',
    price: '$149',
    period: '/mo',
    features: [
      'Up to 8 cameras',
      'Face Recognition',
      'Intrusion & Line Crossing',
      'Email alerts',
    ],
    clients: 1,
  },
  {
    key: 'pro',
    name: 'Pro',
    tagline: 'Growing multi-camera deployments',
    Icon: Shield,
    tint: 'bg-blue-50 text-blue-500 dark:bg-blue-500/10 dark:text-blue-300',
    price: '$449',
    period: '/mo',
    popular: true,
    features: [
      'Up to 24 cameras',
      'All Starter detections',
      'PPE, Loitering & Crowd',
      'Priority support',
    ],
    clients: 2,
  },
  {
    key: 'enterprise',
    name: 'Enterprise',
    tagline: 'Large-scale, multi-region estates',
    Icon: Star,
    tint: 'bg-purple-50 text-purple-500 dark:bg-purple-500/10 dark:text-purple-300',
    priceCustom: 'Custom',
    features: [
      'Unlimited cameras',
      'Every detection type',
      'ANPR, Object & Fire/Smoke',
      'Dedicated success manager',
    ],
    clients: 3,
  },
]
