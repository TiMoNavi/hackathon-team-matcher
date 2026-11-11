import { gql } from "@apollo/client";


export const REGISTER_MUT = gql`
  mutation Register($email: String!, $password: String!, $username: String!, $name: String) {
    register(email: $email, password: $password, username: $username, name: $name) {
      token
      user {
        id
        username
        avatarUrl
        account { id }
      }
    }
  }
`;

export const LOGIN_MUT = gql`
  mutation Login($emailOrUsername: String!, $password: String!) {
    login(emailOrUsername: $emailOrUsername, password: $password) {
      token
      user { id username }
    }
  }
`;

export const REQUEST_PHONE_LOGIN_CODE = gql`
  mutation RequestPhoneLoginCode($phoneNumber: String!) {
    requestPhoneLoginCode(phoneNumber: $phoneNumber) {
      phoneNumber
      expiresAt
    }
  }
`;

export const CHECK_PHONE_AVAILABILITY = gql`
  mutation CheckPhoneAvailability($phoneNumber: String!) {
    checkPhoneAvailability(phoneNumber: $phoneNumber)
  }
`;

export const VERIFY_PHONE_LOGIN_CODE = gql`
  mutation VerifyPhoneLoginCode($phoneNumber: String!, $code: String!, $username: String, $name: String) {
    verifyPhoneLoginCode(phoneNumber: $phoneNumber, code: $code, username: $username, name: $name) {
      token
      user {
        id
        username
        avatarUrl
        avatarThumbUrl
        onboardingCompletedAt
        account {
          id
          phoneNumber
          phoneVerifiedAt
        }
      }
    }
  }
`;

export const ME_QUERY = gql`
  query Me { me { id username email } }
`;


export const LOGIN = gql`
  mutation Login($emailOrUsername: String!, $password: String!) {
    login(emailOrUsername: $emailOrUsername, password: $password) {
      token
      user { id username avatarUrl account { id } }
    }
  }
`;
