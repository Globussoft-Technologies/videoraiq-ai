import Topbar from '../../layout/Topbar'
import PlanCard from './components/PlanCard'
import { PLANS } from './data'

const SubscriptionPlans = () => {
  return (
    <>
      <Topbar eyebrow="PLATFORM" title="Subscription Plans" />

      <div className="px-8 py-6">
        <div className="grid grid-cols-1 items-start gap-6 md:grid-cols-2 xl:grid-cols-3">
          {PLANS.map((plan) => (
            <div key={plan.key} className={plan.popular ? 'xl:-mt-3' : ''}>
              <PlanCard plan={plan} />
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

export default SubscriptionPlans
