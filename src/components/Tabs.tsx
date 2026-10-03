interface Props {
  tabs: string[];
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export default function Tabs({ tabs, activeTab, onTabChange }: Props) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((tab) => {
        const isActive = activeTab === tab;
        return (
          <button
            key={tab}
            className={`tab${isActive ? ' is-active' : ''}`}
            onClick={() => onTabChange(tab)}
            role="tab"
            aria-selected={isActive}
          >
            {tab}
          </button>
        );
      })}
    </div>
  );
}
