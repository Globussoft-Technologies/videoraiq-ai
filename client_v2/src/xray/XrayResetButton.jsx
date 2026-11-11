/** A fresh selection closes the old session before claiming a new GPU slot. */
export default function XrayResetButton({onReset, disabled=false}) {
  return (
    <button type="button" onClick={onReset} disabled={disabled}
      aria-label="Reset X-Ray selection"
      title="Clear this track and prepare X-Ray for a new object"
      style={{height:30,display:'inline-flex',alignItems:'center',gap:6,padding:'0 10px',
        borderRadius:15,border:'1px solid rgba(103,232,249,.4)',background:'rgba(6,21,32,.88)',
        color:'#e3faff',fontSize:11.5,fontWeight:600,backdropFilter:'blur(8px)',
        cursor:disabled?'wait':'pointer',opacity:disabled?0.5:1}}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M3 10a9 9 0 1 1 2 8M3 4v6h6" />
      </svg>
      New selection
    </button>
  );
}
