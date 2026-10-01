import Topbar from '../../layout/Topbar'
import { getAuthUser, getInitials } from '../../utils/authUser'
import getAccessToken from '../../utils/getAccessToken'
import { getProfileRole, profileText } from '../../utils/profile'

const Profile = () => {
  const user = getAuthUser()
  const name = profileText(user?.name)
  const email = profileText(user?.email)
  const fields = [
    { label: 'Name', value: name },
    { label: 'Email', value: email },
    { label: 'Role', value: getProfileRole(user, getAccessToken()) },
  ]

  return (
    <>
      <Topbar eyebrow="ACCOUNT" title="View Profile" />
      <div className="px-4 py-6 sm:px-6 lg:px-8">
        {user ? (
          <section
            aria-label="Your profile"
            className="mx-auto max-w-4xl overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-white/8 dark:bg-[#0b0d13]"
          >
            <div className="flex items-center gap-4 border-b border-gray-100 p-5 sm:p-6 dark:border-white/6">
              <span
                role="img"
                aria-label={name === 'Not provided' ? 'Profile avatar' : `${name}'s initials avatar`}
                className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-purple-500 to-fuchsia-500 text-xl font-semibold text-white"
              >
                {getInitials(typeof user.name === 'string' ? user.name : '')}
              </span>
              <div className="min-w-0">
                <h2 className="text-lg font-bold wrap-anywhere text-gray-900 dark:text-white">{name}</h2>
                <p className="mt-1 text-sm wrap-anywhere text-gray-500 dark:text-gray-400">{email}</p>
              </div>
            </div>
            <dl className="grid grid-cols-1 gap-x-8 gap-y-6 p-5 sm:grid-cols-2 sm:p-6">
              {fields.map(({ label, value }) => (
                <div key={label} className="min-w-0">
                  <dt className="text-xs font-medium text-gray-400 dark:text-gray-500">{label}</dt>
                  <dd className="mt-1.5 text-sm font-semibold wrap-anywhere text-gray-900 dark:text-gray-100">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ) : (
          <div role="status" className="mx-auto max-w-4xl rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-500 dark:border-white/8 dark:bg-[#0b0d13] dark:text-gray-400">
            Profile information is unavailable. Sign in again to load your account details.
          </div>
        )}
      </div>
    </>
  )
}

export default Profile
