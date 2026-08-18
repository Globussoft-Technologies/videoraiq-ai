import Skeleton, { SkeletonTheme } from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';
import { UserCard, UserTableRow } from './UserListItems';

/** Grid / table renderer for the authorized-users list (skeletons + empty state). */
const UsersListView = ({
  viewMode,
  loading,
  users,
  theme,
  currentPage,
  limit,
  selectedUserIds,
  allUsersSelected,
  handleSelectAll,
  toggleUserSelection,
  handleEdit,
  handleDelete,
  onRequestStatusChange,
  setSelectedUser,
  setIsUserModalOpen,
  canEdit = true,
  canDelete = true,
}) => (
  <SkeletonTheme
    baseColor={theme === 'dark' ? '#171c28' : '#e8edf5'}
    highlightColor={theme === 'dark' ? '#22283a' : '#f3f6fb'}
  >
    <div className="mt-5 flex-1">
      {viewMode === 'grid' ? (
        <div className="max-h-[65vh] overflow-y-auto vq-scroll pr-1">
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-6">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="bg-[var(--bg1solid)] rounded-2xl p-5 border border-[var(--bd)]">
                  <Skeleton circle width={96} height={96} className="mx-auto" />
                  <div className="mt-4">
                    <Skeleton count={4} />
                  </div>
                </div>
              ))}
            </div>
          ) : users.length === 0 ? (
            <div className="text-center py-12 text-[var(--tx3)]">No users found.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-6">
              {users.map((user) => (
                <UserCard
                  key={user._id}
                  user={user}
                  handleEdit={handleEdit}
                  handleDelete={handleDelete}
                  onRequestStatusChange={onRequestStatusChange}
                  selectedUserIds={selectedUserIds}
                  toggleUserSelection={toggleUserSelection}
                  setSelectedUser={setSelectedUser}
                  setIsUserModalOpen={setIsUserModalOpen}
                  canEdit={canEdit}
                  canDelete={canDelete}
                />
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="w-full overflow-x-auto overflow-y-auto max-h-[65vh] vq-scroll rounded-xl border border-[var(--bd)]">
          <table className="w-full min-w-[700px] text-left border-collapse table-fixed">
            <colgroup>
              <col style={{ width: '36px' }} />
              <col style={{ width: '48px' }} />
              <col style={{ width: '20%' }} />
              <col style={{ width: '22%' }} />
              <col style={{ width: '16%' }} />
              <col style={{ width: '13%' }} />
              <col style={{ width: '13%' }} />
              <col style={{ width: '13%' }} />
            </colgroup>
            <thead className="sticky top-0 z-10">
              <tr className="bg-[var(--bg2)] text-[var(--tx2)]">
                <th className="px-3 py-3 text-[11px] font-semibold text-center">
                  {canDelete && (
                    <input
                      type="checkbox"
                      checked={allUsersSelected}
                      onChange={handleSelectAll}
                      className="accent-[var(--blue)]"
                    />
                  )}
                </th>
                <th className="px-3 py-3 text-[11px] font-semibold text-center">#</th>
                <th className="px-3 py-3 text-[11px] font-semibold">Name</th>
                <th className="px-3 py-3 text-[11px] font-semibold">Email</th>
                <th className="px-3 py-3 text-[11px] font-semibold">Department</th>
                <th className="px-3 py-3 text-[11px] font-semibold">Location</th>
                <th className="px-3 py-3 text-[11px] font-semibold text-center">Status</th>
                <th className="px-3 py-3 text-[11px] font-semibold text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [...Array(8)].map((_, i) => (
                  <tr key={i} className="border-b border-[var(--bd)]">
                    {[...Array(8)].map((__, j) => (
                      <td key={j} className="px-4 py-3">
                        <Skeleton height={16} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-[var(--tx3)] text-sm">
                    No users found.
                  </td>
                </tr>
              ) : (
                users.map((user, index) => (
                  <UserTableRow
                    key={user._id}
                    user={user}
                    index={index}
                    currentPage={currentPage}
                    limit={limit}
                    handleEdit={handleEdit}
                    handleDelete={handleDelete}
                    onRequestStatusChange={onRequestStatusChange}
                    selectedUserIds={selectedUserIds}
                    toggleUserSelection={toggleUserSelection}
                    setSelectedUser={setSelectedUser}
                    setIsUserModalOpen={setIsUserModalOpen}
                    canEdit={canEdit}
                    canDelete={canDelete}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  </SkeletonTheme>
);

export default UsersListView;
