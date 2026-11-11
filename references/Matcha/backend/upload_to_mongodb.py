from pymongo import MongoClient
import json
from typing import Dict, List
import os

class MongoDBUploader:
    def __init__(self, connection_string: str):
        """
        Initialize MongoDB connection.

        Args:
            connection_string: MongoDB Atlas connection string
        """
        self.client = MongoClient(connection_string)

    def upload_participants(self, json_file: str, database_name: str = "devpost_data",
                          collection_name: str = "participants"):
        """
        Upload participants data to MongoDB Atlas.

        Args:
            json_file: Path to the JSON file containing participant data
            database_name: Name of the database to use
            collection_name: Name of the collection to use
        """
        # Read JSON data
        print(f"📖 Reading data from {json_file}...")
        with open(json_file, 'r', encoding='utf-8') as f:
            data = json.load(f)

        # Get database and collection
        db = self.client[database_name]
        collection = db[collection_name]

        # Prepare documents for insertion
        all_participants = []

        for hackathon_name, participants in data.items():
            print(f"\n📦 Processing {hackathon_name}: {len(participants)} participants")

            # Add hackathon name to each participant document
            for participant in participants:
                participant['hackathon'] = hackathon_name
                all_participants.append(participant)

        # Clear existing data (optional - comment out if you want to keep existing data)
        print(f"\n🗑️  Clearing existing data in {collection_name}...")
        collection.delete_many({})

        # Insert all participants
        print(f"\n⬆️  Uploading {len(all_participants)} participants to MongoDB Atlas...")

        if all_participants:
            result = collection.insert_many(all_participants)
            print(f"✅ Successfully inserted {len(result.inserted_ids)} documents!")
        else:
            print("⚠️  No participants to upload")
            return

        # Create indexes for better query performance
        print("\n🔍 Creating indexes...")
        collection.create_index("hackathon")
        collection.create_index("participant_id")
        collection.create_index("name")
        collection.create_index("skills")
        collection.create_index("interests")
        print("✅ Indexes created!")

        # Display statistics
        print("\n" + "=" * 70)
        print("📊 Database Statistics:")
        print("=" * 70)

        for hackathon_name in data.keys():
            count = collection.count_documents({"hackathon": hackathon_name})
            print(f"  {hackathon_name}: {count} participants")

        total = collection.count_documents({})
        print(f"  Total: {total} participants")

        # Sample queries
        print("\n" + "=" * 70)
        print("🔎 Sample Queries:")
        print("=" * 70)

        # Find participants with Python skills
        python_devs = collection.count_documents({"skills": "python"})
        print(f"  Participants with Python skills: {python_devs}")

        # Find participants with ML/AI interests
        ml_interested = collection.count_documents({"interests": "Machine Learning/AI"})
        print(f"  Participants interested in ML/AI: {ml_interested}")

        # Find full-stack developers
        fullstack = collection.count_documents({"role": "Full-stack developer"})
        print(f"  Full-stack developers: {fullstack}")

        print("\n✅ Upload complete!")

    def query_examples(self, database_name: str = "devpost_data",
                      collection_name: str = "participants"):
        """
        Demonstrate some example queries.
        """
        db = self.client[database_name]
        collection = db[collection_name]

        print("\n" + "=" * 70)
        print("📝 Example Query Results:")
        print("=" * 70)

        # Example 1: Find participants with specific skills
        print("\n1. Top 3 participants with 'python' and 'javascript' skills:")
        results = collection.find({
            "skills": {"$all": ["python", "javascript"]}
        }).limit(3)

        for i, participant in enumerate(results, 1):
            print(f"   {i}. {participant['name']} - {participant.get('role', 'No role')} ({participant['hackathon']})")
            print(f"      Skills: {', '.join(participant.get('skills', []))}")

        # Example 2: Find participants with most projects
        print("\n2. Top 5 participants by number of projects:")
        results = collection.find({
            "stats.projects": {"$exists": True}
        }).sort("stats.projects", -1).limit(5)

        for i, participant in enumerate(results, 1):
            projects = participant.get('stats', {}).get('projects', 0)
            print(f"   {i}. {participant['name']} - {projects} projects ({participant['hackathon']})")

        # Example 3: Aggregate by role
        print("\n3. Participant count by role:")
        pipeline = [
            {"$group": {"_id": "$role", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}},
            {"$limit": 5}
        ]
        results = collection.aggregate(pipeline)

        for i, result in enumerate(results, 1):
            role = result['_id'] if result['_id'] else 'No role specified'
            print(f"   {i}. {role}: {result['count']} participants")

    def close(self):
        """Close the MongoDB connection."""
        self.client.close()
        print("\n🔌 MongoDB connection closed")


def main():
    # MongoDB Atlas connection string
    # Format: mongodb+srv://<username>:<password>@<cluster-url>/<database>?retryWrites=true&w=majority

    print("=" * 70)
    print("MongoDB Atlas Uploader for Devpost Participants")
    print("=" * 70)

    # You need to replace this with your actual MongoDB Atlas connection string
    # Get it from: MongoDB Atlas Dashboard > Connect > Connect your application
    connection_string = os.getenv('MONGODB_URI') or input("\nEnter your MongoDB Atlas connection string: ").strip()

    if not connection_string:
        print("❌ No connection string provided!")
        return

    try:
        # Initialize uploader
        uploader = MongoDBUploader(connection_string)

        # Upload data
        uploader.upload_participants(
            json_file='participants_full.json',
            database_name='devpost_data',
            collection_name='participants'
        )

        # Run example queries
        uploader.query_examples()

        # Close connection
        uploader.close()

    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    main()
