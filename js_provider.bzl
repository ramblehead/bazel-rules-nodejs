"""The JS provider allows rules to interoperate without knowledge of each other.

You can think of a provider as a message bus.
A rule "publishes" a message as an instance of the provider, and some other rule subscribes to these
by having a (possibly transitive) dependency on the publisher.
"""

JSInfo = provider(fields = [])
