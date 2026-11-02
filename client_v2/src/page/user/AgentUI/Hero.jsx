import Robot from './Robot';
import StatusPill from './StatusPill';
import ActionCard from './ActionCard';
import { actionCards } from './data';

export default function Hero({ ticker, activeCard, onAsk }) {
  return <section className="agent-hero flex flex-col items-center"><Robot /><div className="agent-copy w-full text-center"><h1>Hello! I’m <span>VideoraAI.</span></h1><p>Your intelligent AI assistant for video intelligence, live monitoring, analytics, and more.</p><StatusPill text={ticker} /><div className="agent-cards grid">{actionCards.map((card, index) => <ActionCard key={card.title} card={card} active={index === activeCard} onAsk={onAsk} />)}</div></div></section>;
}
