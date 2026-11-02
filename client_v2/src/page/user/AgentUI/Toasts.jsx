export default function Toasts({ items }) {
  return <div className="agent-toasts flex flex-col" aria-live="polite">{items.map((item) => <div className={`agent-toast ${item.type === 'error' ? 'error' : ''} ${item.exiting ? 'out' : ''}`} key={item.id}>{item.text}</div>)}</div>;
}
