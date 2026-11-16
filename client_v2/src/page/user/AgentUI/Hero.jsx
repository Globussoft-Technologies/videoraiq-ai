import Robot from './Robot';
import StatusPill from './StatusPill';
import ActionCard from './ActionCard';
import { actionCards } from './data';

export default function Hero({ ticker, activeCard, onAsk }) {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  return <section className="agent-hero flex flex-col items-center"><Robot /><div className="agent-copy w-full text-center"><h1>{greeting} from <span>VideoraAI.</span></h1><p>Ask about incidents, camera health, detections, and proposed changes.</p><StatusPill text={ticker} /><div className="agent-cards grid">{actionCards.map((card, index) => <ActionCard key={card.title} card={card} active={index === activeCard} onAsk={onAsk} />)}</div></div></section>;
}
