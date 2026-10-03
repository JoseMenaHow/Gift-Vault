export type Person = {
  id: string;
  name: string;
  relationship: string;
  photoUrl?: string;
  emoji?: string;
  labelText?: string;
};

export type Memory = {
  id: string;
  personId: string;
  text: string;
  createdAt: string;
};

export type GiftIdea = {
  id: string;
  personId: string;
  title: string;
  description?: string;
  link?: string;
  occasionTags?: string[];
  imageUrl?: string;
  emoji?: string;
  createdAt: string;
};

export type AppState = {
  people: Person[];
  memories: Memory[];
  ideas: GiftIdea[];
};
