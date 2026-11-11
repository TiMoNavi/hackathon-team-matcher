import { gql } from "@apollo/client";
import { apollo } from "../../apollo";
import { Auth } from "../../lib/auth";

export const SWITCH_ACTIVE_PROFILE = gql`
  mutation SwitchActiveProfile($profileId: ID!) {
    switchActiveProfile(profileId: $profileId) {
      token
      user { id username }
    }
  }
`;

export async function switchActiveProfile(profileId: string) {
  const res = await apollo.mutate({
    mutation: SWITCH_ACTIVE_PROFILE,
    variables: { profileId },
  });

  const token = res.data?.switchActiveProfile?.token;
  const user = res.data?.switchActiveProfile?.user;

  if (token) {
    await Auth.set(token);
    await Auth.setProfileId(user?.id ?? profileId); // optional
    await apollo.clearStore();
  }

  return user;
}
