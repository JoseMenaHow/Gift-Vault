export type Person = {
  id: string;
  name: string;
  tags?: string[];
  photoUrl?: string;
  emoji?: string;
  labelText?: string;
  birthday?: string;
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
  giftedAt?: string;
};

export type AppState = {
  people: Person[];
  memories: Memory[];
  ideas: GiftIdea[];
};
