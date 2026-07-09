import { Check } from 'lucide-react'

const PlanCard = ({ plan }) => {
  const { name, tagline, Icon, tint, price, period, priceCustom, features, clients, popular } = plan

  return (
    <div
      className={`relative flex flex-col rounded-2xl border bg-white p-6 shadow-sm dark:bg-[#0b0d13] ${
        popular
          ? 'border-purple-400/60 shadow-purple-500/10 dark:border-purple-400/50 dark:shadow-[0_0_40px_-12px_rgba(168,85,247,0.5)]'
          : 'border-gray-200 dark:border-white/8'
      }`}
    >
      {/* Popular badge */}
      {popular && (
        <span className="absolute -top-3 right-6 rounded-full bg-linear-to-r from-blue-600 to-purple-600 px-3 py-1 font-mono text-[10px] font-semibold tracking-[0.12em] text-white shadow-sm">
          POPULAR
        </span>
      )}

      {/* Icon */}
      <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${tint}`}>
        <Icon size={22} strokeWidth={2} />
      </span>

      {/* Name + tagline */}
      <h3 className="mt-4 text-xl font-bold text-gray-900 dark:text-white">{name}</h3>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{tagline}</p>

      {/* Price */}
      <div className="mt-5 border-b border-gray-100 pb-5 dark:border-white/6">
        {priceCustom ? (
          <span className="text-4xl font-extrabold text-gray-900 dark:text-white">{priceCustom}</span>
        ) : (
          <span className="text-4xl font-extrabold text-gray-900 dark:text-white">
            {price}
            <span className="ml-1 text-sm font-medium text-gray-400 dark:text-gray-500">
              {period}
            </span>
          </span>
        )}
      </div>

      {/* Features */}
      <ul className="mt-5 flex flex-1 flex-col gap-3">
        {features.map((feature) => (
          <li key={feature} className="flex items-center gap-2.5 text-sm text-gray-600 dark:text-gray-300">
            <Check size={16} strokeWidth={2.6} className="shrink-0 text-green-500 dark:text-green-400" />
            {feature}
          </li>
        ))}
      </ul>

      {/* Footer: client count */}
      <div className="mt-6 rounded-xl border border-gray-200 bg-gray-50 py-2.5 text-center font-mono text-[11px] tracking-[0.06em] text-gray-500 dark:border-white/8 dark:bg-white/4 dark:text-gray-400">
        {clients} {clients === 1 ? 'client' : 'clients'} on this plan
      </div>
    </div>
  )
}

export default PlanCard
