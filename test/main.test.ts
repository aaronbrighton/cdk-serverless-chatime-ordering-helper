import '@aws-cdk/assert/jest';
import { App } from '@aws-cdk/core';
import { ChatimeNotifier } from '../src/main';

test('Snapshot', () => {
  const app = new App();
  const stack = new ChatimeNotifier(app, 'test');

  expect(stack).toHaveResource('AWS::Lambda::Function');
  expect(stack).toHaveResource('AWS::StepFunctions::StateMachine');
  expect(stack).toHaveResource('AWS::Location::PlaceIndex');
  expect(stack).toHaveResource('AWS::SNS::Topic');
  expect(stack).toHaveResource('AWS::SNS::Subscription');
  expect(stack).toHaveResource('AWS::SQS::Queue');
  expect(stack).toHaveResource('AWS::Events::Rule');
  expect(stack).toHaveResource('AWS::Lambda::EventSourceMapping');
  //expect(app.synth().getStackArtifact(stack.artifactId).template).toMatchSnapshot();
});