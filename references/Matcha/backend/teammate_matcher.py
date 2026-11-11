import google.generativeai as genai
from pymongo import MongoClient
import json
from typing import List, Dict
import os

class TeammateMatcher:
    """Use Gemini AI to find compatible teammates based on participant data"""

    def __init__(self, api_key: str, mongodb_uri: str):
        """
        Initialize the matcher with Gemini API and MongoDB connection.

        Args:
            api_key: Google Gemini API key
            mongodb_uri: MongoDB connection string
        """
        genai.configure(api_key=api_key)
        # Use the latest Gemini model
        self.model = genai.GenerativeModel('gemini-2.5-flash')
        self.client = MongoClient(mongodb_uri)
        self.db = self.client['devpost_data']
        self.collection = self.db['participants']

    def find_teammates_with_query(self, current_user_id: str, hackathon: str, search_query: str, top_n: int = 5) -> List[Dict]:
        """
        Find teammates based on a custom search query using Gemini AI.

        Args:
            current_user_id: Participant ID of the current user
            hackathon: Hackathon name to search within
            search_query: Custom search criteria (e.g., "looking for Python expert with multiple projects")
            top_n: Number of top matches to return

        Returns:
            List of matched participants with match scores and reasons
        """
        # Get current user data
        current_user = self.collection.find_one({
            'participant_id': current_user_id,
            'hackathon': hackathon
        })

        if not current_user:
            raise ValueError(f"User with ID {current_user_id} not found in {hackathon}")

        # Get all other participants from the same hackathon
        all_participants = list(self.collection.find({
            'hackathon': hackathon,
            'participant_id': {'$ne': current_user_id}
        }))

        if not all_participants:
            return []

        print(f"Total participants to analyze: {len(all_participants)}")
        print(f"Custom search query: {search_query}")

        # PRE-FILTER: Use basic keyword matching to reduce candidates
        # Extract keywords from search query and filter participants
        max_candidates = 50  # Limit to 50 best candidates before AI analysis

        if len(all_participants) > max_candidates:
            print(f"Pre-filtering from {len(all_participants)} to {max_candidates} candidates...")
            filtered_participants = self._prefilter_by_query(all_participants, search_query, max_candidates)
        else:
            filtered_participants = all_participants

        print(f"Analyzing {len(filtered_participants)} candidates with AI...")

        # Prepare data for Gemini
        current_user_profile = self._format_profile(current_user)

        # Process in ONE batch if possible (faster), or two batches max
        batch_size = 30  # Increased batch size for fewer API calls
        all_matches = []

        total_batches = (len(filtered_participants) + batch_size - 1) // batch_size
        for i in range(0, len(filtered_participants), batch_size):
            batch_num = (i // batch_size) + 1
            print(f"Processing batch {batch_num}/{total_batches}...")
            batch = filtered_participants[i:i+batch_size]
            matches = self._analyze_batch_with_query(current_user_profile, batch, search_query)
            all_matches.extend(matches)

        # Sort by match score and return top N
        all_matches.sort(key=lambda x: x['match_score'], reverse=True)

        print(f"Returning top {top_n} matches")
        return all_matches[:top_n]

    def find_teammates(self, current_user_id: str, hackathon: str, top_n: int = 5) -> List[Dict]:
        """
        Find the best teammates for a user using Gemini AI.

        Args:
            current_user_id: Participant ID of the current user
            hackathon: Hackathon name to search within
            top_n: Number of top matches to return

        Returns:
            List of matched participants with match scores and reasons
        """
        # Get current user data
        current_user = self.collection.find_one({
            'participant_id': current_user_id,
            'hackathon': hackathon
        })

        if not current_user:
            raise ValueError(f"User with ID {current_user_id} not found in {hackathon}")

        # Get all other participants from the same hackathon
        all_participants = list(self.collection.find({
            'hackathon': hackathon,
            'participant_id': {'$ne': current_user_id}
        }))

        if not all_participants:
            return []

        print(f"Total participants to analyze: {len(all_participants)}")

        # PRE-FILTER: Quick scoring to reduce candidates before AI analysis
        # Only send top 50 candidates to AI for detailed analysis
        max_candidates_for_ai = 50

        if len(all_participants) > max_candidates_for_ai:
            print(f"Pre-filtering from {len(all_participants)} to {max_candidates_for_ai} candidates...")
            # Quick score based on skills, interests, and projects
            scored_participants = []
            current_skills = set(current_user.get('skills', []))
            current_interests = set(current_user.get('interests', []))

            for participant in all_participants:
                p_skills = set(participant.get('skills', []))
                p_interests = set(participant.get('interests', []))
                p_projects = participant.get('stats', {}).get('projects', 0)

                # Score: complementary skills + shared interests + experience
                complementary_skills = len(p_skills - current_skills)  # Different skills
                shared_interests = len(p_interests & current_interests)  # Common interests
                quick_score = (complementary_skills * 5) + (shared_interests * 10) + (p_projects * 2)

                scored_participants.append((quick_score, participant))

            # Sort by quick score and take top candidates
            scored_participants.sort(reverse=True, key=lambda x: x[0])
            all_participants = [p for _, p in scored_participants[:max_candidates_for_ai]]
            print(f"Reduced to {len(all_participants)} top candidates for AI analysis")

        # Prepare data for Gemini
        current_user_profile = self._format_profile(current_user)

        # Analyze in batches to avoid token limits
        batch_size = 20
        all_matches = []

        total_batches = (len(all_participants) + batch_size - 1) // batch_size
        for i in range(0, len(all_participants), batch_size):
            batch_num = (i // batch_size) + 1
            print(f"Processing batch {batch_num}/{total_batches}...")
            batch = all_participants[i:i+batch_size]
            matches = self._analyze_batch(current_user_profile, batch)
            all_matches.extend(matches)

        # Deduplicate matches by participant_id (keep highest score for each person)
        seen_ids = {}
        for match in all_matches:
            participant_id = match.get('participant_id')
            if participant_id:
                if participant_id not in seen_ids or match['match_score'] > seen_ids[participant_id]['match_score']:
                    seen_ids[participant_id] = match

        # Convert back to list and sort by match score
        deduplicated_matches = list(seen_ids.values())
        deduplicated_matches.sort(key=lambda x: x['match_score'], reverse=True)

        print(f"Total matches after deduplication: {len(deduplicated_matches)}")
        print(f"Returning top {top_n} matches")
        return deduplicated_matches[:top_n]

    def _format_profile(self, participant: Dict) -> str:
        """Format participant data into a readable profile"""
        profile = f"Name: {participant.get('name', 'Unknown')}\n"
        profile += f"Role: {participant.get('role', 'Not specified')}\n"

        stats = participant.get('stats', {})
        profile += f"Projects: {stats.get('projects', 0)}\n"
        profile += f"Achievements: {stats.get('achievements', 0)}\n"

        skills = participant.get('skills', [])
        if skills:
            profile += f"Skills: {', '.join(skills)}\n"

        interests = participant.get('interests', [])
        if interests:
            profile += f"Interests: {', '.join(interests)}\n"

        return profile

    def _prefilter_by_query(self, participants: List[Dict], search_query: str, max_candidates: int) -> List[Dict]:
        """
        Pre-filter participants using keyword matching to reduce the number of candidates
        for AI analysis. This makes searches much faster.
        """
        query_lower = search_query.lower()

        # Extract common tech keywords
        common_keywords = ['python', 'javascript', 'java', 'react', 'node', 'typescript', 'go', 'rust',
                          'machine learning', 'ml', 'ai', 'data science', 'backend', 'frontend',
                          'fullstack', 'full stack', 'mobile', 'ios', 'android', 'flutter', 'web',
                          'blockchain', 'solidity', 'ethereum', 'web3', 'docker', 'kubernetes',
                          'aws', 'cloud', 'devops', 'database', 'sql', 'mongodb', 'postgres',
                          'ui/ux', 'design', 'figma', 'css', 'tailwind', 'django', 'flask',
                          'express', 'nestjs', 'graphql', 'rest', 'api']

        # Score each participant based on keyword matches
        scored_participants = []

        for participant in participants:
            score = 0

            # Combine all searchable text
            skills = participant.get('skills', [])
            interests = participant.get('interests', [])
            role = participant.get('role', '').lower()

            searchable_text = ' '.join(skills + interests + [role]).lower()

            # Count keyword matches in the query
            for keyword in common_keywords:
                if keyword in query_lower:
                    # This keyword is in the search query
                    if keyword in searchable_text:
                        # Participant has this keyword
                        score += 10

            # Boost for having many skills/projects
            stats = participant.get('stats', {})
            score += len(skills) * 2
            score += stats.get('projects', 0) * 3
            score += stats.get('achievements', 0) * 2

            # Check for direct text match in query
            words = query_lower.split()
            for word in words:
                if len(word) > 3:  # Skip short words
                    if word in searchable_text:
                        score += 5

            scored_participants.append((score, participant))

        # Sort by score and return top candidates
        scored_participants.sort(reverse=True, key=lambda x: x[0])
        return [p for _, p in scored_participants[:max_candidates]]

    def _analyze_batch_with_query(self, current_user_profile: str, candidates: List[Dict], search_query: str) -> List[Dict]:
        """Use Gemini to analyze a batch of candidates with a custom search query"""

        # Format candidates
        candidates_text = ""
        for idx, candidate in enumerate(candidates):
            candidates_text += f"\n--- Candidate {idx + 1} (ID: {candidate.get('participant_id')}) ---\n"
            candidates_text += self._format_profile(candidate)

        # Create prompt for Gemini with custom search query
        prompt = f"""You are a hackathon teammate matching expert. Analyze the following participant profiles based on the user's CUSTOM SEARCH CRITERIA.

CURRENT USER PROFILE:
{current_user_profile}

USER'S SEARCH CRITERIA:
"{search_query}"

POTENTIAL TEAMMATES:
{candidates_text}

For each candidate, provide:
1. A match score from 0-100 (higher is better) based on how well they match the search criteria
2. A detailed reason (2-3 sentences) explaining why they match (or don't match) the search criteria

IMPORTANT: Prioritize the user's search criteria above all else. If they're looking for "Python experts with multiple projects", focus heavily on Python skills and project count.

Consider:
- Direct match to the search criteria (HIGHEST PRIORITY)
- Relevant skills mentioned in the search query
- Experience level and project history as specified
- Any other specific requirements in the search query

Respond ONLY with a valid JSON array:
[
  {{
    "candidate_id": "participant_id",
    "match_score": 85,
    "reason": "Excellent match for your criteria. Has extensive Python experience with 8+ projects, specializing in backend development and data science."
  }},
  ...
]

Return ONLY the JSON array, no markdown formatting, no explanatory text before or after."""

        try:
            response = self.model.generate_content(prompt)

            # Extract JSON from response
            response_text = response.text.strip()

            # Remove markdown code blocks if present
            if response_text.startswith('```json'):
                response_text = response_text[7:]
            if response_text.startswith('```'):
                response_text = response_text[3:]
            if response_text.endswith('```'):
                response_text = response_text[:-3]

            response_text = response_text.strip()

            # Debug: Print response to see what we're getting
            print(f"AI Response (first 500 chars): {response_text[:500]}")

            # Parse JSON
            matches = json.loads(response_text)

            # Enhance with full participant data
            enhanced_matches = []
            for match in matches:
                candidate_id = match.get('candidate_id')
                candidate = next((c for c in candidates if c.get('participant_id') == candidate_id), None)

                if candidate:
                    # Get the reason from the AI response
                    ai_reason = match.get('reason', '')
                    if not ai_reason:
                        # Fallback reason if AI didn't provide one
                        ai_reason = f"Compatible teammate with {len(candidate.get('skills', []))} skills and {candidate.get('stats', {}).get('projects', 0)} projects."

                    enhanced_match = {
                        'participant_id': candidate.get('participant_id'),
                        'name': candidate.get('name'),
                        'role': candidate.get('role'),
                        'profile_url': candidate.get('profile_url'),
                        'skills': candidate.get('skills', []),
                        'interests': candidate.get('interests', []),
                        'stats': candidate.get('stats', {}),
                        'photo_url': candidate.get('photo_url'),
                        'match_score': match.get('match_score', 0),
                        'match_reason': ai_reason
                    }
                    enhanced_matches.append(enhanced_match)

                    # Debug: Print match info
                    print(f"Match: {candidate.get('name')} - Score: {match.get('match_score')} - Reason: {ai_reason[:100]}...")

            return enhanced_matches

        except Exception as e:
            print(f"Error analyzing batch with query: {e}")
            import traceback
            traceback.print_exc()
            # Fallback: return candidates with basic scoring
            return self._fallback_scoring(candidates)

    def _analyze_batch(self, current_user_profile: str, candidates: List[Dict]) -> List[Dict]:
        """Use Gemini to analyze a batch of candidates"""

        # Format candidates
        candidates_text = ""
        for idx, candidate in enumerate(candidates):
            candidates_text += f"\n--- Candidate {idx + 1} (ID: {candidate.get('participant_id')}) ---\n"
            candidates_text += self._format_profile(candidate)

        # Create prompt for Gemini
        prompt = f"""You are a hackathon teammate matching expert. Analyze the following participant profiles and determine compatibility.

CURRENT USER PROFILE:
{current_user_profile}

POTENTIAL TEAMMATES:
{candidates_text}

For each candidate, provide:
1. A match score from 0-100 (higher is better)
2. A detailed reason (2-3 sentences) explaining why they would be a good teammate

Consider:
- Complementary skills (team needs diverse skills, not duplicates)
- Shared interests and goals (common passions like ML/AI, blockchain, etc.)
- Experience level balance (mix of experienced and learning developers)
- Technical stack compatibility (compatible languages and frameworks)
- Project history as indicator of commitment and experience

Respond ONLY with a valid JSON array:
[
  {{
    "candidate_id": "participant_id",
    "match_score": 85,
    "reason": "Strong complementary skills in frontend development with React expertise. Shares passion for ML/AI projects and has proven track record with 5+ hackathon submissions showing dedication."
  }},
  ...
]

Return ONLY the JSON array, no markdown formatting, no explanatory text before or after."""

        try:
            response = self.model.generate_content(prompt)

            # Extract JSON from response
            response_text = response.text.strip()

            # Remove markdown code blocks if present
            if response_text.startswith('```json'):
                response_text = response_text[7:]
            if response_text.startswith('```'):
                response_text = response_text[3:]
            if response_text.endswith('```'):
                response_text = response_text[:-3]

            response_text = response_text.strip()

            # Debug: Print response to see what we're getting
            print(f"AI Response (first 500 chars): {response_text[:500]}")

            # Parse JSON
            matches = json.loads(response_text)

            # Enhance with full participant data
            enhanced_matches = []
            for match in matches:
                candidate_id = match.get('candidate_id')
                candidate = next((c for c in candidates if c.get('participant_id') == candidate_id), None)

                if candidate:
                    # Get the reason from the AI response
                    ai_reason = match.get('reason', '')
                    if not ai_reason:
                        # Fallback reason if AI didn't provide one
                        ai_reason = f"Compatible teammate with {len(candidate.get('skills', []))} skills and {candidate.get('stats', {}).get('projects', 0)} projects."

                    enhanced_match = {
                        'participant_id': candidate.get('participant_id'),
                        'name': candidate.get('name'),
                        'role': candidate.get('role'),
                        'profile_url': candidate.get('profile_url'),
                        'skills': candidate.get('skills', []),
                        'interests': candidate.get('interests', []),
                        'stats': candidate.get('stats', {}),
                        'photo_url': candidate.get('photo_url'),
                        'match_score': match.get('match_score', 0),
                        'match_reason': ai_reason
                    }
                    enhanced_matches.append(enhanced_match)

                    # Debug: Print match info
                    print(f"Match: {candidate.get('name')} - Score: {match.get('match_score')} - Reason: {ai_reason[:100]}...")

            return enhanced_matches

        except Exception as e:
            print(f"Error analyzing batch: {e}")
            import traceback
            traceback.print_exc()
            # Fallback: return candidates with basic scoring
            return self._fallback_scoring(candidates)

    def _fallback_scoring(self, candidates: List[Dict]) -> List[Dict]:
        """Simple fallback scoring if Gemini fails"""
        matches = []
        for candidate in candidates:
            stats = candidate.get('stats', {})
            skills = candidate.get('skills', [])
            interests = candidate.get('interests', [])
            skills_count = len(skills)
            projects = stats.get('projects', 0)

            # Simple score based on projects and skills
            score = min(100, projects * 10 + skills_count * 5)

            # Create a basic reason
            reason_parts = []
            if projects > 0:
                reason_parts.append(f"Has completed {projects} project{'s' if projects != 1 else ''}")
            if skills_count > 0:
                top_skills = ', '.join(skills[:3])
                reason_parts.append(f"skilled in {top_skills}")
            if interests:
                reason_parts.append(f"interested in {', '.join(interests[:2])}")

            reason = '. '.join(reason_parts) if reason_parts else "Potential teammate based on profile"

            matches.append({
                'participant_id': candidate.get('participant_id'),
                'name': candidate.get('name'),
                'role': candidate.get('role'),
                'profile_url': candidate.get('profile_url'),
                'skills': skills,
                'interests': interests,
                'stats': stats,
                'photo_url': candidate.get('photo_url'),
                'match_score': score,
                'match_reason': reason + '.'
            })

        return matches

    def close(self):
        """Close MongoDB connection"""
        self.client.close()


# Example usage
if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()

    GEMINI_API_KEY = os.getenv('GEMINI_API_KEY', '')
    MONGODB_URI = os.getenv('MONGODB_URI', '')

    if not GEMINI_API_KEY or not MONGODB_URI:
        print("Error: Please set GEMINI_API_KEY and MONGODB_URI in .env file")
        exit(1)

    matcher = TeammateMatcher(GEMINI_API_KEY, MONGODB_URI)

    try:
        # Example: Find teammates for the first participant in hackutd-2025
        matches = matcher.find_teammates(
            current_user_id="2457597",  # Replace with actual participant ID
            hackathon="hackutd-2025",
            top_n=5
        )

        print("Top 5 Teammate Matches:")
        print("=" * 80)

        for i, match in enumerate(matches, 1):
            print(f"\n{i}. {match['name']} (Score: {match['match_score']}/100)")
            print(f"   Role: {match.get('role', 'Not specified')}")
            print(f"   Skills: {', '.join(match['skills'][:5])}")
            print(f"   Why: {match['match_reason']}")
            print(f"   Profile: {match['profile_url']}")

    finally:
        matcher.close()
