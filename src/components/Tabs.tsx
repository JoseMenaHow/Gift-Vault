interface Props {
  tabs: string[];
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export default function Tabs({ tabs, activeTab, onTabChange }: Props) {
  return (
    <div style={styles.container}>
      {tabs.map((tab) => (
        <button
          key={tab}
          onClick={() => onTabChange(tab)}
          style={{
            ...styles.tab,
            ...(activeTab === tab ? styles.tabActive : {}),
          }}
        >
          {tab}
        </button>
      ))}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    gap: '32px',
    borderBottom: '1px solid #E5E7EB',
    marginBottom: '24px',
  },
  tab: {
    fontSize: '16px',
    color: '#6B7280',
    paddingBottom: '12px',
    position: 'relative',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontWeight: 500,
  },
  tabActive: {
    color: '#2B2B2B',
    borderBottom: '2px solid #4F6EF7',
  },
};
